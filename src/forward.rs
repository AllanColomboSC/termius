//! Port forwarding rules: Local (-L), Remote (-R) and Dynamic (-D, a SOCKS5 proxy).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::ssh::{self, Target};

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct Rule {
    /// "local", "remote" or "dynamic".
    pub kind: String,
    pub bind_address: String,
    pub bind_port: u16,
    pub dest_host: String,
    pub dest_port: u16,
}

impl Default for Rule {
    fn default() -> Self {
        Rule { kind: "local".into(), bind_address: "127.0.0.1".into(), bind_port: 0, dest_host: "127.0.0.1".into(), dest_port: 0 }
    }
}

#[derive(Default)]
pub struct Forwards {
    pub running: Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>,
}

#[derive(serde::Serialize, Clone)]
struct State<'a> {
    id: &'a str,
    running: bool,
    error: Option<String>,
}

pub async fn start(app: AppHandle, f: Arc<Forwards>, id: String, target: Target, rule: Rule) -> Result<(), String> {
    stop(&f, &id);
    let remote_map: ssh::RemoteMap = Arc::new(Mutex::new(HashMap::new()));
    let link = ssh::connect(&target, remote_map.clone()).await?;
    let link = Arc::new(link);
    let bind = if rule.bind_address.trim().is_empty() { "127.0.0.1".to_string() } else { rule.bind_address.clone() };

    let task = match rule.kind.as_str() {
        "remote" => {
            remote_map.lock().unwrap().insert(rule.bind_port as u32, (rule.dest_host.clone(), rule.dest_port));
            link.conn
                .tcpip_forward(bind.clone(), rule.bind_port as u32)
                .await
                .map_err(|e| format!("The server refused to listen on {bind}:{}: {e}", rule.bind_port))?;
            let link = link.clone();
            tauri::async_runtime::spawn(async move {
                // Remote connections are served by the SSH handler; this task keeps the link open.
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    if link.conn.is_closed() {
                        break;
                    }
                }
            })
        }
        kind => {
            let listener = TcpListener::bind((bind.as_str(), rule.bind_port))
                .await
                .map_err(|e| format!("Could not listen on {bind}:{}: {e}", rule.bind_port))?;
            let dynamic = kind == "dynamic";
            let rule = rule.clone();
            let link = link.clone();
            tauri::async_runtime::spawn(async move {
                while let Ok((sock, peer)) = listener.accept().await {
                    let link = link.clone();
                    let rule = rule.clone();
                    tokio::spawn(async move {
                        let r = if dynamic {
                            socks5(sock, &link.conn).await
                        } else {
                            pipe(sock, &link.conn, &rule.dest_host, rule.dest_port, peer.port()).await
                        };
                        let _ = r;
                    });
                }
            })
        }
    };
    f.running.lock().unwrap().insert(id.clone(), task);
    let _ = app.emit("pf-state", State { id: &id, running: true, error: None });
    Ok(())
}

async fn pipe(mut sock: TcpStream, conn: &ssh::Conn, host: &str, port: u16, origin_port: u16) -> Result<(), String> {
    let ch = conn
        .channel_open_direct_tcpip(host.to_string(), port as u32, "127.0.0.1", origin_port as u32)
        .await
        .map_err(|e| e.to_string())?;
    let mut stream = ch.into_stream();
    tokio::io::copy_bidirectional(&mut sock, &mut stream).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// A minimal SOCKS5 server (no authentication, CONNECT only) that tunnels through SSH.
async fn socks5(mut sock: TcpStream, conn: &ssh::Conn) -> Result<(), String> {
    let mut head = [0u8; 2];
    sock.read_exact(&mut head).await.map_err(|e| e.to_string())?;
    if head[0] != 5 {
        return Err("not socks5".into());
    }
    let mut methods = vec![0u8; head[1] as usize];
    sock.read_exact(&mut methods).await.map_err(|e| e.to_string())?;
    sock.write_all(&[5, 0]).await.map_err(|e| e.to_string())?;
    let mut req = [0u8; 4];
    sock.read_exact(&mut req).await.map_err(|e| e.to_string())?;
    if req[1] != 1 {
        let _ = sock.write_all(&[5, 7, 0, 1, 0, 0, 0, 0, 0, 0]).await;
        return Err("only CONNECT is supported".into());
    }
    let host = match req[3] {
        1 => {
            let mut a = [0u8; 4];
            sock.read_exact(&mut a).await.map_err(|e| e.to_string())?;
            std::net::Ipv4Addr::from(a).to_string()
        }
        3 => {
            let mut len = [0u8; 1];
            sock.read_exact(&mut len).await.map_err(|e| e.to_string())?;
            let mut name = vec![0u8; len[0] as usize];
            sock.read_exact(&mut name).await.map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&name).to_string()
        }
        4 => {
            let mut a = [0u8; 16];
            sock.read_exact(&mut a).await.map_err(|e| e.to_string())?;
            std::net::Ipv6Addr::from(a).to_string()
        }
        _ => return Err("bad address".into()),
    };
    let mut p = [0u8; 2];
    sock.read_exact(&mut p).await.map_err(|e| e.to_string())?;
    let port = u16::from_be_bytes(p);
    match conn.channel_open_direct_tcpip(host, port as u32, "127.0.0.1", 0).await {
        Ok(ch) => {
            sock.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await.map_err(|e| e.to_string())?;
            let mut stream = ch.into_stream();
            let _ = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
            Ok(())
        }
        Err(e) => {
            let _ = sock.write_all(&[5, 5, 0, 1, 0, 0, 0, 0, 0, 0]).await;
            Err(e.to_string())
        }
    }
}

pub fn stop(f: &Forwards, id: &str) -> bool {
    if let Some(t) = f.running.lock().unwrap().remove(id) {
        t.abort();
        return true;
    }
    false
}
