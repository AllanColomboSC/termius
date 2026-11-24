# TermFreeUs

A free SSH client for Windows (Rust + Tauri) and Android (Flutter), laid out like the commercial SSH clients
people are used to: hosts and groups, terminal tabs, SFTP, keychain, port forwarding, snippets, known hosts and logs.

This is an independent project. It is not affiliated with, endorsed by or connected to any commercial SSH client,
and it contains none of their code, logos or artwork.

## Features

- **Hosts & groups** with inherited credentials, tags, host chaining (jump hosts) and import from `~/.ssh/config`.
- **Terminal tabs** (xterm.js): SSH, local shell and serial ports; 64 colour themes; search; snippets side panel.
- **SFTP** dual-pane browser with upload, download, rename and delete.
- **Keychain**: generate ED25519 / ECDSA / RSA keys, import key files or the keys in your `.ssh` folder;
  locked keys open with their passphrase (or the host's password when that's where it was saved).
- **Port forwarding**: local, remote and dynamic (SOCKS).
- **Host usage on host cards**: CPU, RAM and battery of Linux hosts whose saved login works, refreshed every 10 s.
- Your data stays on your computer: `%APPDATA%\Shellboxault.json`. Nothing is sent anywhere.

## Desktop (Windows)

Needs Rust (stable) and the WebView2 runtime (built into Windows 11).

```
cargo build --release
```

The program is `target/release/shellbox.exe`, a single file with the interface built in.
`cargo test` runs the SSH tests against a small server started inside the tests.

## Phone (Android)

Needs Flutter 3.

```
cd mobile
flutter pub get
flutter build apk --release
```

## Fonts and licences of bundled files

- Interface font: DM Sans, SIL Open Font License (`ui/fonts/DM-Sans-LICENSE.txt`).
- Terminal font: Sauce Code Pro Nerd Font (Source Code Pro, SIL Open Font License; Nerd Fonts patches, MIT).
- Terminal widget: xterm.js (MIT). Operating system icons: Simple Icons (CC0).
