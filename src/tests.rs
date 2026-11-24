//! Checks the SSH side against a small SSH server started inside the test.

use std::sync::{Arc, Mutex};

use russh::server::{self, Auth, Msg, Server as _, Session};
use russh::{Channel, ChannelId, ChannelMsg};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::ssh::{self, Target};

#[derive(Clone, Default)]
struct TestServer {
    shells: Arc<Mutex<std::collections::HashSet<ChannelId>>>,
}

impl server::Server for TestServer {
    type Handler = Self;
    fn new_client(&mut self, _: Option<std::net::SocketAddr>) -> Self {
        TestServer::default()
    }
}

/// The public keys user "bob" may log in with (added by the key tests).
static BOB_KEY: Mutex<Vec<String>> = Mutex::new(Vec::new());

impl server::Handler for TestServer {
    type Error = russh::Error;

    async fn auth_publickey(&mut self, user: &str, key: server::VerifiedPublicKey<'_>) -> Result<Auth, Self::Error> {
        let fp = key.public_key.fingerprint(russh::keys::HashAlg::Sha256).to_string();
        let ok = user == "bob" && BOB_KEY.lock().unwrap().contains(&fp);
        Ok(if ok { Auth::Accept } else { Auth::reject() })
    }

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        Ok(if user == "alice" && password == "secret" { Auth::Accept } else { Auth::reject() })
    }

    async fn channel_open_session(&mut self, c: Channel<Msg>, reply: server::ChannelOpenHandle, _s: &mut Session) -> Result<(), Self::Error> {
        self.shells.lock().unwrap().insert(c.id());
        reply.accept().await;
        Ok(())
    }

    async fn pty_request(&mut self, channel: ChannelId, _t: &str, _c: u32, _r: u32, _pw: u32, _ph: u32, _m: &[(russh::Pty, u32)], session: &mut Session) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        Ok(())
    }

    async fn shell_request(&mut self, channel: ChannelId, session: &mut Session) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        session.data(channel, b"Welcome to Ubuntu 24.04\r\n$ ".to_vec())?;
        Ok(())
    }

    async fn data(&mut self, channel: ChannelId, data: &[u8], session: &mut Session) -> Result<(), Self::Error> {
        if self.shells.lock().unwrap().contains(&channel) {
            session.data(channel, [b"echo:".as_slice(), data].concat())?;
        }
        Ok(())
    }

    async fn channel_open_direct_tcpip(&mut self, channel: Channel<Msg>, host: &str, port: u32, _oa: &str, _op: u32, reply: server::ChannelOpenHandle, _s: &mut Session) -> Result<(), Self::Error> {
        let host = host.to_string();
        reply.accept().await;
        tokio::spawn(async move {
            if let Ok(mut sock) = tokio::net::TcpStream::connect((host.as_str(), port as u16)).await {
                let mut stream = channel.into_stream();
                let _ = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
            }
        });
        Ok(())
    }
}

async fn start_server() -> u16 {
    let config = Arc::new(server::Config {
        auth_rejection_time: std::time::Duration::from_millis(10),
        auth_rejection_time_initial: Some(std::time::Duration::from_millis(0)),
        keys: vec![russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519).unwrap()],
        ..Default::default()
    });
    let socket = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = socket.local_addr().unwrap().port();
    tokio::spawn(async move {
        let mut s = TestServer::default();
        let _ = s.run_on_socket(config, &socket).await;
    });
    port
}

fn target(port: u16) -> Target {
    Target { host: "127.0.0.1".into(), port, username: "alice".into(), password: "secret".into(), ..Default::default() }
}

fn no_remote() -> ssh::RemoteMap {
    Arc::new(Mutex::new(Default::default()))
}

#[tokio::test]
async fn unknown_host_key_is_reported_then_accepted() {
    let port = start_server().await;
    let err = ssh::connect(&target(port), no_remote()).await.err().expect("should ask about the key");
    assert!(err.starts_with("HOSTKEY_UNKNOWN|SHA256:"), "{err}");
    let fp = err.split('|').nth(1).unwrap().to_string();

    // Trusted fingerprint: connects without asking.
    let mut t = target(port);
    t.trusted = vec![fp.clone()];
    assert!(ssh::connect(&t, no_remote()).await.is_ok());

    // A different saved fingerprint means the key changed.
    let mut t = target(port);
    t.trusted = vec!["SHA256:somethingelse".into()];
    let err = ssh::connect(&t, no_remote()).await.err().unwrap();
    assert!(err.starts_with("HOSTKEY_CHANGED|"), "{err}");
}

#[tokio::test]
async fn wrong_password_and_missing_credentials() {
    let port = start_server().await;
    let mut t = target(port);
    t.trust_new = true;
    t.password = "nope".into();
    let err = ssh::connect(&t, no_remote()).await.err().unwrap();
    assert!(err.starts_with("AUTH_FAILED|"), "{err}");

    let mut t = target(port);
    t.trust_new = true;
    t.username = String::new();
    let err = ssh::connect(&t, no_remote()).await.err().unwrap();
    assert!(err.starts_with("AUTH_NEEDED|"), "{err}");
}

#[tokio::test]
async fn shell_round_trip() {
    let port = start_server().await;
    let mut t = target(port);
    t.trust_new = true;
    let link = ssh::connect(&t, no_remote()).await.unwrap();
    let mut ch = link.conn.channel_open_session().await.unwrap();
    ch.request_pty(false, "xterm-256color", 80, 24, 0, 0, &[]).await.unwrap();
    ch.request_shell(true).await.unwrap();
    let mut seen = Vec::new();
    ch.data(&b"ls\r"[..]).await.unwrap();
    while let Ok(Some(msg)) = tokio::time::timeout(std::time::Duration::from_secs(5), ch.wait()).await {
        if let ChannelMsg::Data { data } = msg {
            seen.extend_from_slice(&data);
            if String::from_utf8_lossy(&seen).contains("echo:ls") {
                break;
            }
        }
    }
    let text = String::from_utf8_lossy(&seen);
    assert!(text.contains("Welcome to Ubuntu"), "{text}");
    assert!(text.contains("echo:ls"), "{text}");
}

#[tokio::test]
async fn host_chain_and_tunnel() {
    let port = start_server().await;
    let mut hop = target(port);
    hop.trust_new = true;
    let mut t = target(port);
    t.trust_new = true;
    t.chain = vec![hop];
    let link = ssh::connect(&t, no_remote()).await.expect("connect through a jump host");

    // A TCP echo service reached through the tunnel (what Local forwarding does).
    let echo = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let echo_port = echo.local_addr().unwrap().port();
    tokio::spawn(async move {
        let (mut s, _) = echo.accept().await.unwrap();
        let mut buf = [0u8; 64];
        let n = s.read(&mut buf).await.unwrap();
        s.write_all(&buf[..n]).await.unwrap();
    });
    let ch = link.conn.channel_open_direct_tcpip("127.0.0.1", echo_port as u32, "127.0.0.1", 0).await.unwrap();
    let mut stream = ch.into_stream();
    stream.write_all(b"ping").await.unwrap();
    let mut buf = [0u8; 4];
    tokio::time::timeout(std::time::Duration::from_secs(5), stream.read_exact(&mut buf)).await.unwrap().unwrap();
    assert_eq!(&buf, b"ping");
}

/// Against a real server: `SHELLBOX_LIVE=user@host[:port] cargo test live -- --ignored --nocapture`.
/// Without a password it should get as far as asking for one.
#[tokio::test]
#[ignore]
async fn live_server() {
    let spec = std::env::var("SHELLBOX_LIVE").expect("set SHELLBOX_LIVE=user@host[:port]");
    let (user, rest) = spec.split_once('@').unwrap();
    let (host, port) = rest.split_once(':').map(|(h, p)| (h, p.parse().unwrap())).unwrap_or((rest, 22));
    let mut t = Target { host: host.into(), port, username: user.into(), password: std::env::var("SHELLBOX_PASS").unwrap_or_default(), ..Default::default() };
    let err = ssh::connect(&t, no_remote()).await.err().expect("first contact asks about the key");
    println!("first contact: {err}");
    assert!(err.starts_with("HOSTKEY_UNKNOWN|SHA256:"));
    t.trust_new = true;
    match ssh::connect(&t, no_remote()).await {
        Ok(link) => {
            let mut ch = link.conn.channel_open_session().await.unwrap();
            ch.request_pty(false, "xterm-256color", 80, 24, 0, 0, &[]).await.unwrap();
            ch.request_shell(true).await.unwrap();
            let mut seen = Vec::new();
            while let Ok(Some(msg)) = tokio::time::timeout(std::time::Duration::from_secs(3), ch.wait()).await {
                if let ChannelMsg::Data { data } = msg { seen.extend_from_slice(&data); }
            }
            println!("shell said: {}", String::from_utf8_lossy(&seen));
        }
        Err(e) => {
            println!("after trusting the key: {e}");
            assert!(e.starts_with("AUTH_"), "{e}");
        }
    }
}

#[test]
fn keys_generate_and_read_back() {
    for kind in ["ed25519", "ecdsa-256", "rsa-2048"] {
        let k = crate::keys::generate(kind, "", "test").unwrap();
        assert!(k.private_key.contains("OPENSSH PRIVATE KEY"));
        assert!(k.fingerprint.starts_with("SHA256:"));
        let back = crate::keys::inspect(&k.private_key, "").unwrap();
        assert_eq!(back.fingerprint, k.fingerprint);
    }
    let enc = crate::keys::generate("ed25519", "pw", "test").unwrap();
    assert!(crate::keys::inspect(&enc.private_key, "").is_err());
    assert!(crate::keys::inspect(&enc.private_key, "pw").is_ok());
}

#[tokio::test]
async fn host_without_key_uses_imported_computer_key() {
    let port = start_server().await;
    let pair = crate::keys::generate("ed25519", "pass123", "laptop").unwrap();
    BOB_KEY.lock().unwrap().push(pair.fingerprint.clone());
    let base = Target { host: "127.0.0.1".into(), port, username: "bob".into(), trust_new: true, local_keys: true, ..Default::default() };

    // The locked key with its saved passphrase logs in although the host has no key of its own.
    let mut t = base.clone();
    t.extra_keys = vec![(pair.private_key.clone(), "pass123".into())];
    assert!(ssh::connect(&t, no_remote()).await.is_ok());

    // Without the passphrase it can't be used, and nothing else is tried silently.
    let mut t = base.clone();
    t.extra_keys = vec![(pair.private_key.clone(), String::new())];
    assert!(ssh::connect(&t, no_remote()).await.is_err());

    // Turned off in Settings: computer keys are not tried.
    let mut t = base;
    t.local_keys = false;
    t.extra_keys = vec![(pair.private_key, "pass123".into())];
    assert!(ssh::connect(&t, no_remote()).await.is_err());
}

/// Diagnoses a saved host's login without showing secrets:
/// `SHELLBOX_DIAG=<host label> cargo test diag_saved_host -- --ignored --nocapture`.
#[tokio::test]
#[ignore]
async fn diag_saved_host() {
    use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg};
    let label = std::env::var("SHELLBOX_DIAG").expect("set SHELLBOX_DIAG to a host label");
    let path = dirs::data_dir().unwrap().join("Shellbox").join("vault.json");
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let host = v["hosts"].as_array().unwrap().iter().find(|h| h["label"] == label.as_str()).expect("no such host").clone();
    let key = v["keys"].as_array().unwrap().iter().find(|k| k["id"] == host["keyId"]).cloned();
    let addr = host["address"].as_str().unwrap().to_string();
    let port = host["port"].as_u64().unwrap_or(22) as u16;
    let user = host["username"].as_str().unwrap().to_string();
    let mut t = Target { host: addr.clone(), port, username: user.clone(), trust_new: true, ..Default::default() };
    t.chain = vec![];
    let cfg = std::sync::Arc::new(russh::client::Config::default());
    #[derive(Clone)]
    struct Any;
    impl russh::client::Handler for Any {
        type Error = russh::Error;
        async fn check_server_key(&mut self, _k: &russh::keys::PublicKeyOrCertificate) -> Result<bool, Self::Error> { Ok(true) }
    }
    let mut c = russh::client::connect(cfg, (addr.as_str(), port), Any).await.expect("tcp/ssh connect");
    println!("connected to {addr}:{port} as {user}");
    println!("server rsa hash: {:?}", c.best_supported_rsa_hash().await);
    let none = c.authenticate_none(user.clone()).await.unwrap();
    println!("none -> {none:?}");
    if let Some(k) = key {
        let pem = k["privateKey"].as_str().unwrap_or("");
        let pass = k["passphrase"].as_str().unwrap_or("");
        match decode_secret_key(pem.trim(), if pass.is_empty() { None } else { Some(pass) }) {
            Ok(sk) => {
                println!("key {} decoded: {} {}", k["label"], sk.algorithm(), sk.public_key().fingerprint(russh::keys::HashAlg::Sha256));
                let r = c.authenticate_publickey(user.clone(), PrivateKeyWithHashAlg::new(std::sync::Arc::new(sk), None)).await;
                println!("publickey -> {r:?}");
            }
            Err(e) => {
                println!("key {} could not be read: {e}", k["label"]);
                let hp = host["password"].as_str().unwrap_or("");
                match decode_secret_key(pem.trim(), Some(hp)) {
                    Ok(sk) => {
                        println!("the host's saved password unlocks the key");
                        let r = c.authenticate_publickey(user.clone(), PrivateKeyWithHashAlg::new(std::sync::Arc::new(sk), None)).await;
                        println!("publickey with it -> {r:?}");
                    }
                    Err(_) => println!("the host's saved password does not unlock the key"),
                }
            }
        }
    }
    // The app's own login path, with the host exactly as saved.
    t.password = host["password"].as_str().unwrap_or("").to_string();
    t.local_keys = true;
    if let Some(k) = v["keys"].as_array().unwrap().iter().find(|k| k["id"] == host["keyId"]) {
        t.key = k["privateKey"].as_str().unwrap_or("").to_string();
        t.passphrase = k["passphrase"].as_str().unwrap_or("").to_string();
    }
    match ssh::connect(&t, no_remote()).await {
        Ok(_) => println!("app login: connected"),
        Err(e) => println!("app login: {e}"),
    }
    // And without the password: the app should ask for the key's passphrase.
    t.password.clear();
    match ssh::connect(&t, no_remote()).await {
        Ok(_) => println!("app login without password: connected"),
        Err(e) => println!("app login without password: {e}"),
    }
}

#[tokio::test]
async fn locked_host_key_opens_with_password_or_asks_for_passphrase() {
    let port = start_server().await;
    let pair = crate::keys::generate("ed25519", "keypass", "ec2").unwrap();
    BOB_KEY.lock().unwrap().push(pair.fingerprint.clone());
    let base = Target { host: "127.0.0.1".into(), port, username: "bob".into(), trust_new: true, key: pair.private_key.clone(), ..Default::default() };

    // The key's passphrase saved in the host's password field: the key opens and the server takes it.
    let mut t = base.clone();
    t.password = "keypass".into();
    assert!(ssh::connect(&t, no_remote()).await.is_ok());

    // Saved with the key itself: works too.
    let mut t = base.clone();
    t.passphrase = "keypass".into();
    assert!(ssh::connect(&t, no_remote()).await.is_ok());

    // Nothing that opens it: the app is told to ask for the key's passphrase, not the account password.
    let err = ssh::connect(&base, no_remote()).await.err().unwrap();
    assert!(err.starts_with("KEY_PASSPHRASE|"), "{err}");
}
