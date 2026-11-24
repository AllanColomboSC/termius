//! Opening SSH connections: host key checks, authentication and host chaining.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use russh::client::{self, ChannelOpenHandle, Handle, KeyboardInteractiveAuthResponse};
use russh::keys::{self, HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{Channel, MethodKind};
use serde::Deserialize;

/// Everything needed to reach one SSH server. Sent by the window for every connection.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct Target {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    /// Private key text (OpenSSH or PEM).
    pub key: String,
    pub passphrase: String,
    /// Fingerprints already trusted for this host (from Known Hosts).
    pub trusted: Vec<String>,
    /// The person accepted whatever key the server shows this time.
    pub trust_new: bool,
    /// Seconds between keepalive packets; 0 turns them off.
    pub keepalive: u64,
    /// Hosts to hop through first (host chaining), outermost first.
    pub chain: Vec<Target>,
    /// With no key or password of its own, try this computer's keys in ~/.ssh (like OpenSSH).
    pub local_keys: bool,
    /// Keys imported from this computer into the keychain, with their saved passphrases, tried the same way.
    pub extra_keys: Vec<(String, String)>,
}

/// Where a remote-forwarded connection is sent on this computer.
pub type RemoteMap = Arc<Mutex<HashMap<u32, (String, u16)>>>;

pub struct Client {
    trusted: Vec<String>,
    trust_new: bool,
    seen: Arc<Mutex<Option<(String, String)>>>,
    remote: RemoteMap,
}

impl client::Handler for Client {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let (fp, kind) = match server_public_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => (
                key.fingerprint(HashAlg::Sha256).to_string(),
                key.algorithm().to_string(),
            ),
            PublicKeyOrCertificate::Certificate(cert) => (
                cert.public_key().fingerprint(HashAlg::Sha256).to_string(),
                cert.algorithm().to_string(),
            ),
        };
        *self.seen.lock().unwrap() = Some((fp.clone(), kind));
        Ok(self.trust_new || self.trusted.iter().any(|t| t == &fp))
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<client::Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let dest = self.remote.lock().unwrap().get(&connected_port).cloned()
            .or_else(|| self.remote.lock().unwrap().values().next().cloned());
        let Some((host, port)) = dest else {
            return Ok(());
        };
        reply.accept().await;
        tokio::spawn(async move {
            if let Ok(mut local) = tokio::net::TcpStream::connect((host.as_str(), port)).await {
                let mut stream = channel.into_stream();
                let _ = tokio::io::copy_bidirectional(&mut local, &mut stream).await;
            }
        });
        Ok(())
    }
}

pub type Conn = Handle<Client>;

fn config(keepalive: u64) -> Arc<client::Config> {
    Arc::new(client::Config {
        keepalive_interval: if keepalive > 0 { Some(Duration::from_secs(keepalive)) } else { None },
        keepalive_max: 3,
        inactivity_timeout: None,
        ..Default::default()
    })
}

/// Turns a failed host key check into a message the window understands:
/// `HOSTKEY_UNKNOWN|<fingerprint>|<type>` or `HOSTKEY_CHANGED|...`.
fn hostkey_error(t: &Target, seen: &Arc<Mutex<Option<(String, String)>>>) -> Option<String> {
    let seen = seen.lock().unwrap().clone()?;
    if t.trust_new || t.trusted.iter().any(|f| f == &seen.0) {
        return None;
    }
    let tag = if t.trusted.is_empty() { "HOSTKEY_UNKNOWN" } else { "HOSTKEY_CHANGED" };
    Some(format!("{tag}|{}|{}|{}:{}", seen.0, seen.1, t.host, t.port))
}

/// Connects to `t`, hopping through `t.chain` first, and logs in.
pub async fn connect(t: &Target, remote: RemoteMap) -> Result<Link, String> {
    let mut hops: Vec<Target> = t.chain.clone();
    hops.push(t.clone());
    let mut prev: Option<Conn> = None;
    let mut keep: Vec<Conn> = Vec::new();
    for (i, hop) in hops.iter().enumerate() {
        let last = i + 1 == hops.len();
        let seen = Arc::new(Mutex::new(None));
        let handler = Client {
            trusted: hop.trusted.clone(),
            trust_new: hop.trust_new,
            seen: seen.clone(),
            remote: if last { remote.clone() } else { Arc::new(Mutex::new(HashMap::new())) },
        };
        let port = if hop.port == 0 { 22 } else { hop.port };
        let result = match &prev {
            None => {
                let addr = (hop.host.as_str(), port);
                match tokio::time::timeout(Duration::from_secs(20), client::connect(config(hop.keepalive), addr, handler)).await {
                    Ok(r) => r,
                    Err(_) => return Err(format!("Connection to {}:{} timed out", hop.host, port)),
                }
            }
            Some(via) => {
                let ch = via
                    .channel_open_direct_tcpip(hop.host.clone(), port as u32, "127.0.0.1", 0)
                    .await
                    .map_err(|e| format!("Host chain: could not reach {}:{} ({e})", hop.host, port))?;
                client::connect_stream(config(hop.keepalive), ch.into_stream(), handler).await
            }
        };
        let mut conn = match result {
            Ok(c) => c,
            Err(e) => {
                if let Some(msg) = hostkey_error(hop, &seen) {
                    return Err(msg);
                }
                return Err(format!("Could not connect to {}:{}: {e}", hop.host, port));
            }
        };
        authenticate(&mut conn, hop).await?;
        if let Some(p) = prev.take() {
            keep.push(p);
        }
        prev = Some(conn);
    }
    let conn = prev.ok_or("Nothing to connect to")?;
    Ok(Link { conn, _hops: keep })
}

/// A logged-in connection; outer hops of a host chain stay alive as long as it does.
pub struct Link {
    pub conn: Conn,
    _hops: Vec<Conn>,
}

impl Link {
    pub async fn close(&self) {
        let _ = self.conn.disconnect(russh::Disconnect::ByApplication, "", "en").await;
    }
}

/// Reads a private key: with its own passphrase, or else with the host's password (people often save a
/// key's passphrase in the password field, and the original's login prompt accepts either). `Err(true)` means
/// the key is locked and neither unlocked it.
fn unlock_key(pem: &str, passphrase: &str, password: &str) -> Result<keys::PrivateKey, bool> {
    let first = keys::decode_secret_key(pem.trim(), if passphrase.is_empty() { None } else { Some(passphrase) });
    match first {
        Ok(k) => Ok(k),
        Err(e) => {
            let locked = e.to_string().to_lowercase().contains("encrypt")
                || e.to_string().to_lowercase().contains("decrypt") || pem.contains("ENCRYPTED");
            if locked && !password.is_empty() && password != passphrase {
                if let Ok(k) = keys::decode_secret_key(pem.trim(), Some(password)) {
                    return Ok(k);
                }
            }
            Err(locked)
        }
    }
}

/// What the server still accepts after a refusal (None until it has said).
type Methods = Option<Vec<MethodKind>>;

fn note(res: &client::AuthResult, left: &mut Methods) {
    if let client::AuthResult::Failure { remaining_methods, .. } = res {
        *left = Some(remaining_methods.iter().cloned().collect());
    }
}

async fn try_key(conn: &mut Conn, user: &str, k: keys::PrivateKey, left: &mut Methods) -> Result<bool, String> {
    let hash = conn.best_supported_rsa_hash().await.ok().flatten().flatten();
    let res = conn
        .authenticate_publickey(user.to_string(), PrivateKeyWithHashAlg::new(Arc::new(k), hash))
        .await
        .map_err(|e| e.to_string())?;
    note(&res, left);
    Ok(res.success())
}

async fn authenticate(conn: &mut Conn, t: &Target) -> Result<(), String> {
    if t.username.trim().is_empty() {
        return Err("AUTH_NEEDED|Username is required".into());
    }
    let user = t.username.trim().to_string();
    let mut left: Methods = None;
    let mut key_locked = false;
    let mut key_refused = false;

    // 1. The host's own key.
    if !t.key.trim().is_empty() {
        match unlock_key(&t.key, &t.passphrase, &t.password) {
            Ok(k) => {
                if try_key(conn, &user, k, &mut left).await? {
                    return Ok(());
                }
                key_refused = true;
            }
            Err(locked) => {
                if locked {
                    key_locked = true;
                } else if t.password.is_empty() {
                    return Err("AUTH_NEEDED|Could not read the key: it isn't a private key this app understands".into());
                }
            }
        }
    }

    // 2. This computer's keys (imported ones with their saved passphrase, then unlocked ones in ~/.ssh).
    if t.local_keys && !key_locked {
        let mut found: Vec<keys::PrivateKey> =
            t.extra_keys.iter().filter_map(|(pem, pass)| unlock_key(pem, pass, &t.password).ok()).collect();
        found.extend(tokio::task::spawn_blocking(crate::keys::default_local_keys).await.unwrap_or_default());
        let mut tried = std::collections::HashSet::new();
        if !t.key.trim().is_empty() {
            if let Ok(k) = unlock_key(&t.key, &t.passphrase, &t.password) {
                tried.insert(k.public_key().fingerprint(HashAlg::Sha256).to_string());
            }
        }
        for k in found {
            if !tried.insert(k.public_key().fingerprint(HashAlg::Sha256).to_string()) {
                continue;
            }
            if try_key(conn, &user, k, &mut left).await? {
                return Ok(());
            }
        }
    }

    let allows = |m: MethodKind, left: &Methods| left.as_ref().map_or(true, |l| l.contains(&m));

    // 3. The password, when the server still takes one.
    if !t.password.is_empty() && (allows(MethodKind::Password, &left) || allows(MethodKind::KeyboardInteractive, &left)) {
        if allows(MethodKind::Password, &left) {
            let res = conn
                .authenticate_password(user.clone(), t.password.clone())
                .await
                .map_err(|e| e.to_string())?;
            if res.success() {
                return Ok(());
            }
            note(&res, &mut left);
        }
        // Some servers only accept passwords through keyboard-interactive.
        if allows(MethodKind::KeyboardInteractive, &left) {
            let mut reply = conn
                .authenticate_keyboard_interactive_start(user.clone(), None)
                .await
                .map_err(|e| e.to_string())?;
            for _ in 0..5 {
                match reply {
                    KeyboardInteractiveAuthResponse::Success => return Ok(()),
                    KeyboardInteractiveAuthResponse::Failure { .. } => break,
                    KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                        let answers = prompts.iter().map(|_| t.password.clone()).collect();
                        reply = conn
                            .authenticate_keyboard_interactive_respond(answers)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    // 4. Say what actually went wrong.
    let keys_only = left.as_ref().is_some_and(|l| !l.contains(&MethodKind::Password) && !l.contains(&MethodKind::KeyboardInteractive));
    if key_locked {
        return Err("KEY_PASSPHRASE|This host's key is protected by a passphrase. Type it to unlock the key.".into());
    }
    if keys_only {
        return Err(if key_refused {
            format!("KEY_REFUSED|The server accepts only SSH keys, and it refused this host's key for user \"{user}\". Check the username and that the key's public half is on the server.")
        } else {
            "KEY_REFUSED|The server accepts only SSH keys. Choose this host's key under Host Details (Key).".to_string()
        });
    }
    if !t.password.is_empty() {
        return Err("AUTH_FAILED|Wrong username or password".into());
    }
    if let Ok(res) = conn.authenticate_none(user).await {
        if res.success() {
            return Ok(());
        }
    }
    Err("AUTH_NEEDED|Password or key required".into())
}
