//! SFTP: browsing and transferring files on a server, plus the local side of the dual-pane view.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use russh_sftp::client::SftpSession;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::ssh::{self, Link, Target};

pub struct Remote {
    sftp: SftpSession,
    _link: Link,
}

#[derive(Default)]
pub struct Sftps {
    pub open: Mutex<HashMap<String, Arc<Remote>>>,
}

#[derive(Serialize, Clone)]
pub struct Entry {
    pub name: String,
    pub is_dir: bool,
    pub is_link: bool,
    pub size: u64,
    pub modified: i64,
    pub perms: String,
    pub kind: String,
}

#[derive(Serialize, Clone)]
struct Progress<'a> {
    id: &'a str,
    name: &'a str,
    done: u64,
    total: u64,
    finished: bool,
    error: Option<String>,
}

fn perm_string(mode: u32, is_dir: bool) -> String {
    let mut s = String::with_capacity(10);
    s.push(if is_dir { 'd' } else { '-' });
    for shift in [6, 3, 0] {
        let bits = (mode >> shift) & 7;
        s.push(if bits & 4 != 0 { 'r' } else { '-' });
        s.push(if bits & 2 != 0 { 'w' } else { '-' });
        s.push(if bits & 1 != 0 { 'x' } else { '-' });
    }
    s
}

fn kind_of(name: &str, is_dir: bool) -> String {
    if is_dir {
        return "folder".into();
    }
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some(ext) => ext.to_lowercase(),
        None => "file".into(),
    }
}

fn get(s: &Sftps, id: &str) -> Result<Arc<Remote>, String> {
    s.open.lock().unwrap().get(id).cloned().ok_or_else(|| "SFTP session is closed".to_string())
}

pub async fn connect(s: &Sftps, id: String, target: Target) -> Result<String, String> {
    let link = ssh::connect(&target, Arc::new(Mutex::new(HashMap::new()))).await?;
    let ch = link.conn.channel_open_session().await.map_err(|e| e.to_string())?;
    ch.request_subsystem(true, "sftp").await.map_err(|e| e.to_string())?;
    let sftp = SftpSession::new(ch.into_stream()).await.map_err(|e| e.to_string())?;
    let home = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".into());
    s.open.lock().unwrap().insert(id, Arc::new(Remote { sftp, _link: link }));
    Ok(home)
}

pub async fn list(s: &Sftps, id: &str, path: &str) -> Result<Vec<Entry>, String> {
    let r = get(s, id)?;
    let dir = r.sftp.read_dir(path).await.map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for e in dir {
        let name = e.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let m = e.metadata();
        let is_dir = m.is_dir();
        out.push(Entry {
            kind: kind_of(&name, is_dir),
            is_link: m.is_symlink(),
            size: m.size.unwrap_or(0),
            modified: m.mtime.unwrap_or(0) as i64,
            perms: perm_string(m.permissions.unwrap_or(0), is_dir),
            is_dir,
            name,
        });
    }
    Ok(out)
}

pub async fn mkdir(s: &Sftps, id: &str, path: &str) -> Result<(), String> {
    get(s, id)?.sftp.create_dir(path).await.map_err(|e| e.to_string())
}

pub async fn rename(s: &Sftps, id: &str, from: &str, to: &str) -> Result<(), String> {
    get(s, id)?.sftp.rename(from, to).await.map_err(|e| e.to_string())
}

pub async fn remove(s: &Sftps, id: &str, path: &str) -> Result<(), String> {
    let r = get(s, id)?;
    remove_rec(&r.sftp, path.to_string()).await
}

fn remove_rec<'a>(sftp: &'a SftpSession, path: String) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        let meta = sftp.symlink_metadata(path.clone()).await.map_err(|e| e.to_string())?;
        if meta.is_dir() {
            for e in sftp.read_dir(path.clone()).await.map_err(|e| e.to_string())? {
                let n = e.file_name();
                if n == "." || n == ".." {
                    continue;
                }
                remove_rec(sftp, join_remote(&path, &n)).await?;
            }
            sftp.remove_dir(path).await.map_err(|e| e.to_string())
        } else {
            sftp.remove_file(path).await.map_err(|e| e.to_string())
        }
    })
}

pub fn join_remote(dir: &str, name: &str) -> String {
    if dir.ends_with('/') { format!("{dir}{name}") } else { format!("{dir}/{name}") }
}

const CHUNK: usize = 256 * 1024;

/// Copies a server file or folder into a local folder.
pub async fn download(app: &AppHandle, s: &Sftps, id: &str, remote: &str, local_dir: &str) -> Result<(), String> {
    let r = get(s, id)?;
    let name = remote.rsplit('/').next().unwrap_or("file").to_string();
    let dest = PathBuf::from(local_dir).join(&name);
    let res = download_rec(app, &r.sftp, id, remote.to_string(), dest).await;
    let _ = app.emit("sftp-progress", Progress { id, name: &name, done: 0, total: 0, finished: true, error: res.clone().err() });
    res
}

fn download_rec<'a>(app: &'a AppHandle, sftp: &'a SftpSession, id: &'a str, remote: String, dest: PathBuf) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        let meta = sftp.metadata(remote.clone()).await.map_err(|e| e.to_string())?;
        if meta.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            for e in sftp.read_dir(remote.clone()).await.map_err(|e| e.to_string())? {
                let n = e.file_name();
                if n == "." || n == ".." {
                    continue;
                }
                download_rec(app, sftp, id, join_remote(&remote, &n), dest.join(&n)).await?;
            }
            return Ok(());
        }
        let total = meta.size.unwrap_or(0);
        let name = dest.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let mut file = sftp.open(remote).await.map_err(|e| e.to_string())?;
        let mut out = tokio::fs::File::create(&dest).await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; CHUNK];
        let mut done = 0u64;
        loop {
            let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).await.map_err(|e| e.to_string())?;
            done += n as u64;
            let _ = app.emit("sftp-progress", Progress { id, name: &name, done, total, finished: false, error: None });
        }
        out.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Copies a local file or folder into a server folder.
pub async fn upload(app: &AppHandle, s: &Sftps, id: &str, local: &str, remote_dir: &str) -> Result<(), String> {
    let r = get(s, id)?;
    let src = PathBuf::from(local);
    let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "file".into());
    let res = upload_rec(app, &r.sftp, id, src, join_remote(remote_dir, &name)).await;
    let _ = app.emit("sftp-progress", Progress { id, name: &name, done: 0, total: 0, finished: true, error: res.clone().err() });
    res
}

fn upload_rec<'a>(app: &'a AppHandle, sftp: &'a SftpSession, id: &'a str, src: PathBuf, remote: String) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send + 'a>> {
    Box::pin(async move {
        if src.is_dir() {
            let _ = sftp.create_dir(remote.clone()).await;
            for e in std::fs::read_dir(&src).map_err(|e| e.to_string())? {
                let e = e.map_err(|e| e.to_string())?;
                let n = e.file_name().to_string_lossy().to_string();
                upload_rec(app, sftp, id, e.path(), join_remote(&remote, &n)).await?;
            }
            return Ok(());
        }
        let total = std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
        let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let mut input = tokio::fs::File::open(&src).await.map_err(|e| e.to_string())?;
        let mut file = sftp.create(remote).await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; CHUNK];
        let mut done = 0u64;
        loop {
            let n = input.read(&mut buf).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n]).await.map_err(|e| e.to_string())?;
            done += n as u64;
            let _ = app.emit("sftp-progress", Progress { id, name: &name, done, total, finished: false, error: None });
        }
        file.shutdown().await.map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn close(s: &Sftps, id: &str) {
    s.open.lock().unwrap().remove(id);
}

// ---- this computer ----

pub fn local_list(path: &str) -> Result<Vec<Entry>, String> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let Ok(e) = e else { continue };
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(m) = e.metadata() else { continue };
        let is_dir = m.is_dir();
        let modified = m
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        out.push(Entry {
            kind: kind_of(&name, is_dir),
            is_link: m.file_type().is_symlink(),
            size: if is_dir { 0 } else { m.len() },
            modified,
            perms: if m.permissions().readonly() { "r--".into() } else { "rw-".into() },
            is_dir,
            name,
        });
    }
    Ok(out)
}

pub fn local_remove(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() { std::fs::remove_dir_all(p) } else { std::fs::remove_file(p) }.map_err(|e| e.to_string())
}
