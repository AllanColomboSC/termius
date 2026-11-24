//! Keychain helpers: generating key pairs and reading imported keys.

use russh::keys::ssh_key::{private::RsaKeypair, LineEnding};
use russh::keys::{Algorithm, EcdsaCurve, HashAlg, PrivateKey};
use serde::Serialize;

#[derive(Serialize)]
pub struct KeyPair {
    pub private_key: String,
    pub public_key: String,
    pub fingerprint: String,
    pub key_type: String,
}

fn describe(key: &PrivateKey, comment: &str) -> Result<KeyPair, String> {
    let mut public = key.public_key().clone();
    public.set_comment(comment);
    Ok(KeyPair {
        private_key: String::new(),
        public_key: public.to_openssh().map_err(|e| e.to_string())?,
        fingerprint: public.fingerprint(HashAlg::Sha256).to_string(),
        key_type: key.algorithm().to_string(),
    })
}

/// kind: "ed25519", "ecdsa-256", "ecdsa-384", "ecdsa-521", "rsa-2048", "rsa-4096".
pub fn generate(kind: &str, passphrase: &str, comment: &str) -> Result<KeyPair, String> {
    let mut rng = rand::rng();
    let mut key = match kind {
        "ecdsa-256" => PrivateKey::random(&mut rng, Algorithm::Ecdsa { curve: EcdsaCurve::NistP256 }),
        "ecdsa-384" => PrivateKey::random(&mut rng, Algorithm::Ecdsa { curve: EcdsaCurve::NistP384 }),
        "ecdsa-521" => PrivateKey::random(&mut rng, Algorithm::Ecdsa { curve: EcdsaCurve::NistP521 }),
        k if k.starts_with("rsa") => {
            let bits = k.trim_start_matches("rsa-").parse::<usize>().unwrap_or(4096);
            let pair = RsaKeypair::random(&mut rng, bits).map_err(|e| e.to_string())?;
            Ok(PrivateKey::from(pair))
        }
        _ => PrivateKey::random(&mut rng, Algorithm::Ed25519),
    }
    .map_err(|e| e.to_string())?;
    key.set_comment(comment);
    let mut out = describe(&key, comment)?;
    let saved = if passphrase.is_empty() {
        key
    } else {
        key.encrypt(&mut rng, passphrase).map_err(|e| e.to_string())?
    };
    out.private_key = saved.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?.to_string();
    Ok(out)
}

/// Reads an imported private key and returns its public half.
pub fn inspect(private_key: &str, passphrase: &str) -> Result<KeyPair, String> {
    let pass = if passphrase.is_empty() { None } else { Some(passphrase) };
    let key = russh::keys::decode_secret_key(private_key.trim(), pass).map_err(|e| e.to_string())?;
    let comment = key.comment().as_str_lossy().to_string();
    let mut out = describe(&key, &comment)?;
    out.private_key = private_key.to_string();
    Ok(out)
}

/// A private key file found in this computer's `~/.ssh` folder.
#[derive(Serialize, Clone)]
pub struct LocalKey {
    pub name: String,
    pub path: String,
    pub private_key: String,
    pub public_key: String,
    pub fingerprint: String,
    pub key_type: String,
    /// Needs a passphrase before it can be used.
    pub encrypted: bool,
    /// A format this version can't read (for example a PuTTY .ppk file).
    pub unsupported: bool,
}

pub fn ssh_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|h| h.join(".ssh"))
}

/// Every private key file in `~/.ssh`, like the original's "Import from SSH": each file is read and kept
/// when it holds a private key. Public halves come from the key itself or, when it's locked, its `.pub`.
pub fn scan_local() -> Vec<LocalKey> {
    let Some(dir) = ssh_dir() else { return Vec::new() };
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in entries.flatten() {
        let path = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if !path.is_file() || name.ends_with(".pub") || name.starts_with("known_hosts") || name == "config" || name == "authorized_keys" {
            continue;
        }
        if e.metadata().map(|m| m.len() > 64 * 1024).unwrap_or(true) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        if let Some(k) = describe_local(&name, &path, &text) {
            out.push(k);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn describe_local(name: &str, path: &std::path::Path, text: &str) -> Option<LocalKey> {
    let putty = text.starts_with("PuTTY-User-Key-File");
    if !putty && !text.contains("PRIVATE KEY-----") {
        return None;
    }
    let mut k = LocalKey {
        name: name.to_string(),
        path: path.display().to_string(),
        private_key: text.to_string(),
        public_key: String::new(),
        fingerprint: String::new(),
        key_type: String::new(),
        encrypted: false,
        unsupported: putty,
    };
    match russh::keys::decode_secret_key(text.trim(), None) {
        Ok(key) => {
            let comment = key.comment().as_str_lossy().to_string();
            if let Ok(d) = describe(&key, &comment) {
                k.public_key = d.public_key;
                k.fingerprint = d.fingerprint;
                k.key_type = d.key_type;
            }
        }
        Err(e) => {
            let msg = e.to_string().to_lowercase();
            if !putty {
                k.encrypted = msg.contains("encrypt") || msg.contains("passphrase") || msg.contains("decrypt") || text.contains("ENCRYPTED");
                k.unsupported = !k.encrypted;
            }
            // A locked key still shows who it is through its .pub file.
            let pub_path = path.with_file_name(format!("{name}.pub"));
            if let Ok(p) = std::fs::read_to_string(pub_path) {
                if let Ok(public) = russh::keys::ssh_key::PublicKey::from_openssh(p.trim()) {
                    k.public_key = p.trim().to_string();
                    k.fingerprint = public.fingerprint(HashAlg::Sha256).to_string();
                    k.key_type = public.algorithm().to_string();
                }
            }
        }
    }
    Some(k)
}

/// Unlocked keys from `~/.ssh` to try when a host has no key or password of its own, the way OpenSSH does.
pub fn default_local_keys() -> Vec<PrivateKey> {
    scan_local()
        .into_iter()
        .filter(|k| !k.encrypted && !k.unsupported)
        .filter_map(|k| russh::keys::decode_secret_key(k.private_key.trim(), None).ok())
        .take(5)
        .collect()
}

#[cfg(test)]
mod local_tests {
    use super::*;

    #[test]
    fn finds_plain_and_locked_keys() {
        let dir = std::env::temp_dir().join(format!("shellbox-keys-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let plain = generate("ed25519", "", "me").unwrap();
        let locked = generate("ed25519", "secret", "me2").unwrap();
        let p1 = dir.join("id_ed25519");
        std::fs::write(&p1, &plain.private_key).unwrap();
        let k1 = describe_local("id_ed25519", &p1, &plain.private_key).unwrap();
        assert!(!k1.encrypted && !k1.unsupported);
        assert_eq!(k1.fingerprint, plain.fingerprint);
        let p2 = dir.join("work");
        std::fs::write(&p2, &locked.private_key).unwrap();
        std::fs::write(dir.join("work.pub"), &locked.public_key).unwrap();
        let k2 = describe_local("work", &p2, &locked.private_key).unwrap();
        assert!(k2.encrypted, "a key with a passphrase is reported as locked");
        assert_eq!(k2.fingerprint, locked.fingerprint);
        assert!(describe_local("config", &dir.join("config"), "Host x\n  User y\n").is_none());
        let _ = std::fs::remove_dir_all(dir);
    }
}
