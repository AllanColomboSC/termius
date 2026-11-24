//! Terminal sessions: SSH shells, the local terminal and serial ports.
//! Output goes to the window as `term-data` events (base64), input comes back through `term_write`.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use base64::Engine;
use portable_pty::{CommandBuilder, PtySize};
use russh::ChannelMsg;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::ssh::{self, Target};

pub enum Input {
    Data(Vec<u8>),
    Resize(u32, u32),
    Close,
}

#[derive(Default)]
pub struct Terms {
    pub ssh: Mutex<HashMap<String, mpsc::UnboundedSender<Input>>>,
    pub local: Mutex<HashMap<String, LocalPty>>,
    pub serial: Mutex<HashMap<String, Box<dyn serialport::SerialPort>>>,
}

pub struct LocalPty {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Serialize, Clone)]
struct Data<'a> {
    id: &'a str,
    data: String,
}

#[derive(Serialize, Clone)]
struct Exit<'a> {
    id: &'a str,
    reason: String,
}

fn emit_data(app: &AppHandle, id: &str, bytes: &[u8]) {
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    let _ = app.emit("term-data", Data { id, data });
}

fn emit_exit(app: &AppHandle, id: &str, reason: impl Into<String>) {
    let _ = app.emit("term-exit", Exit { id, reason: reason.into() });
}

/// Opens an SSH shell. Returns once logged in; output then streams as events.
pub async fn open_ssh(
    app: AppHandle,
    terms: Arc<Terms>,
    id: String,
    target: Target,
    cols: u32,
    rows: u32,
    term_type: String,
    env: Vec<(String, String)>,
) -> Result<(), String> {
    let link = ssh::connect(&target, Arc::new(Mutex::new(HashMap::new()))).await?;
    let mut channel = link.conn.channel_open_session().await.map_err(|e| e.to_string())?;
    let term = if term_type.is_empty() { "xterm-256color".to_string() } else { term_type };
    channel
        .request_pty(false, &term, cols.max(1), rows.max(1), 0, 0, &[])
        .await
        .map_err(|e| e.to_string())?;
    for (k, v) in env {
        let _ = channel.set_env(false, k, v).await;
    }
    channel.request_shell(true).await.map_err(|e| e.to_string())?;

    let (tx, mut rx) = mpsc::unbounded_channel::<Input>();
    terms.ssh.lock().unwrap().insert(id.clone(), tx);
    tauri::async_runtime::spawn(async move {
        let reason;
        loop {
            tokio::select! {
                msg = channel.wait() => match msg {
                    Some(ChannelMsg::Data { data }) => emit_data(&app, &id, &data),
                    Some(ChannelMsg::ExtendedData { data, .. }) => emit_data(&app, &id, &data),
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        reason = format!("Process exited with code {exit_status}");
                        break;
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                        reason = "Connection closed".to_string();
                        break;
                    }
                    _ => {}
                },
                cmd = rx.recv() => match cmd {
                    Some(Input::Data(d)) => { if channel.data(&d[..]).await.is_err() { reason = "Connection lost".into(); break; } }
                    Some(Input::Resize(c, r)) => { let _ = channel.window_change(c, r, 0, 0).await; }
                    Some(Input::Close) | None => { reason = "Closed".into(); let _ = channel.close().await; break; }
                },
            }
        }
        link.close().await;
        terms.ssh.lock().unwrap().remove(&id);
        emit_exit(&app, &id, reason);
    });
    Ok(())
}

pub fn default_shell() -> String {
    if cfg!(windows) {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

/// Opens a shell on this computer.
pub fn open_local(app: AppHandle, terms: Arc<Terms>, id: String, shell: String, cols: u16, rows: u16) -> Result<(), String> {
    let pty = portable_pty::native_pty_system();
    let pair = pty
        .openpty(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let shell = if shell.trim().is_empty() { default_shell() } else { shell };
    let mut parts = shell.split_whitespace();
    let mut cmd = CommandBuilder::new(parts.next().unwrap_or("powershell.exe"));
    for a in parts {
        cmd.arg(a);
    }
    if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    terms.local.lock().unwrap().insert(id.clone(), LocalPty { master: pair.master, writer, child });
    std::thread::spawn(move || {
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => emit_data(&app, &id, &buf[..n]),
            }
        }
        terms.local.lock().unwrap().remove(&id);
        emit_exit(&app, &id, "Process exited");
    });
    Ok(())
}

/// Opens a serial port.
pub fn open_serial(app: AppHandle, terms: Arc<Terms>, id: String, path: String, baud: u32) -> Result<(), String> {
    let port = serialport::new(&path, baud)
        .timeout(std::time::Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Could not open {path}: {e}"))?;
    let mut reader = port.try_clone().map_err(|e| e.to_string())?;
    terms.serial.lock().unwrap().insert(id.clone(), port);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            if !terms.serial.lock().unwrap().contains_key(&id) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => {}
                Ok(n) => emit_data(&app, &id, &buf[..n]),
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }
        terms.serial.lock().unwrap().remove(&id);
        emit_exit(&app, &id, "Serial port closed");
    });
    Ok(())
}

pub fn write(terms: &Terms, id: &str, data: Vec<u8>) -> Result<(), String> {
    if let Some(tx) = terms.ssh.lock().unwrap().get(id) {
        return tx.send(Input::Data(data)).map_err(|e| e.to_string());
    }
    if let Some(p) = terms.local.lock().unwrap().get_mut(id) {
        p.writer.write_all(&data).map_err(|e| e.to_string())?;
        return p.writer.flush().map_err(|e| e.to_string());
    }
    if let Some(s) = terms.serial.lock().unwrap().get_mut(id) {
        return s.write_all(&data).map_err(|e| e.to_string());
    }
    Err("Session is not running".into())
}

pub fn resize(terms: &Terms, id: &str, cols: u32, rows: u32) {
    if let Some(tx) = terms.ssh.lock().unwrap().get(id) {
        let _ = tx.send(Input::Resize(cols, rows));
    }
    if let Some(p) = terms.local.lock().unwrap().get(id) {
        let _ = p.master.resize(PtySize { rows: rows as u16, cols: cols as u16, pixel_width: 0, pixel_height: 0 });
    }
}

pub fn close(terms: &Terms, id: &str) {
    if let Some(tx) = terms.ssh.lock().unwrap().remove(id) {
        let _ = tx.send(Input::Close);
    }
    if let Some(mut p) = terms.local.lock().unwrap().remove(id) {
        let _ = p.child.kill();
    }
    terms.serial.lock().unwrap().remove(id);
}
