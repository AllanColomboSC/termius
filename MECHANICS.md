# Mechanics sheet

The original (version 10.4.1) is an Electron app: an NSIS installer holding `resources/app.asar`.
Its rules live in minified JavaScript, not in native functions, so sources below name the
bundle file inside `app.asar` (evidence `ev_4c2182a2…`) and the code they were read from.
Nothing here is pasted code; the rebuild implements each rule itself.

## Window and layout
| Value | Original | Source |
|---|---|---|
| Window frame | frameless (custom title bar) | `main-process/main-process.js`, BrowserWindow `frame:!1` |
| Minimum height | 440 px | same, `minHeight:440` |
| Settings window | 1100 × 680, not resizable | same, `type:"preferences"` window |
| Top tab bar height | 51 px | `ui-process-*.js`, `paneSplit` height `calc(100% - 51px)` |
| Side menu width | 185 px (68 px under 800 px wide) | `ui-process-*.js`, `visible:{width:185, "@media (max-width: 800px)":{width:68}}` |
| Side menu colours (dark) | background `--dark-grey-3` #282b3d, border `--dark-grey-4` #32364a | `ui-process-*.js` `zDe` styles; palette in `reconnectSaga-*.css` |
| Menu item | 36 px high, margin 8 px 10 px, 14 px text, hover #32364a, selected #3e4257 | `ui-process-*.js` `FDe` styles |
| Side menu order | Hosts, Keychain, Port Forwarding, Snippets, Known Hosts, Logs | `baseTabs` minus SFTP (`leftPanelTabs`) |
| Top fixed tabs | Vaults, SFTP, then terminal tabs, then + | `baseTabs`, `homePathMap` in `reconnectSaga-*.js` |
| Hosts toolbar | "New host" split button (menu: New Group, Import, cloud imports), "Terminal", "Serial" | `jCe` component |
| Search placeholder | "Find a host or ssh user@hostname..." | `JCe` component |
| Empty hosts | "Create host", "Type IP or Hostname", "Continue" | `EmptyHostsScreen` |
| Host form | Address (IP or Hostname), General (Label, Parent Group, Tags), SSH port, Username, Password, Key / Certificate / FIDO2, Connect | `HostsScreenSidebar-*.js`, `i7e` form |
| Settings sections | Account, Terminal, SFTP, Logs, Shortcuts | `settingsNavigationSelector` |
| Palette | #141729 #1d2033 #282b3d #32364a #3e4257 #5a5e73 #8d91a5, blue #2091f6, green #21b568, red #f25e61 | `reconnectSaga-*.css` |
| Default window size | 1280 × 800 | **estimated** (computed at run time in the original) |
| Top-right buttons (Windows) | menu (☰), minimize, maximize, close | `reconnectSaga-*.js` `getSystemTopBarActions` (context-menu, minimize, maximize, close) |
| App menu | Vaults (Ctrl+1), SFTP (Ctrl+2), Settings (Ctrl+,), then File, Edit, View, Window, Help | `main-process.js` menu template |

## Terminal
| Value | Original | Source |
|---|---|---|
| Default text size | 14 | `reconnectSaga-*.js` `defaultFontSize=14` |
| Text size limits | 4 … 40 | `minFontSize=4, maxFontSize=40` |
| Default font | Source Code Pro (falls back to Cascadia Mono/Consolas here) | `defaultFontFamily="Source Code Pro"` |
| Font list | Source Code Pro, …Medium, Fira Mono, …Medium, Inconsolata-g, Anonymous Pro, Ubuntu Mono, Droid Sans Mono, Dejavu Sans Mono, PT Mono, Cascadia Code, Fira Code, JetBrains Mono, Meslo | `fontFamilies=[…]` |
| Default theme | "termius dark": bg #141729, fg/cursor #21b568, selection #21b56880 | `colorSchemesArray[0]` (renamed "Default Dark") |
| Themes | 64 colour schemes (16-colour palettes) | `colorSchemesArray`; copied as data into `ui/themes.js` |
| Scrollback | 40000 rows; 0 or above the limit means 40000 | `defaultScrollbackSize=4e4`, Scrollback field logic |
| Keepalive | 0 = off, seconds, clamped to 0 … 2^31-1 | `index-*.js` Keepalive Interval |
| Terminal types | xterm-256color, xterm, linux, vt100 | `Et=[…]` |
| Toggles (default off) | Right click to paste, Bell sound, Option as Meta | `reducers$2` toggles default `!1` |
| Autoreconnect retries | 3 tries, 2 s apart | **estimated** |

## Shortcuts (PC preset)
Ctrl+Shift+C copy, Ctrl+Shift+V paste, Ctrl+Shift+A select all, Ctrl+. side panel, Ctrl+S save workspace (not built),
Ctrl+L local terminal, Ctrl+Alt+B broadcast (not built), Ctrl+Alt+M workspace view (not built), Ctrl+Alt+S serial,
Ctrl+Shift+F find, Ctrl+Shift+W close tab, Ctrl+Shift+S snippets, Ctrl+P port forwarding, Ctrl+K command palette,
Ctrl+J jump to, Ctrl+T new tab, Alt+→ / Alt+← next / previous tab, Ctrl+1 Vaults, Ctrl+2 SFTP, Ctrl+3…8 terminal tabs, Ctrl+9 last tab.
Source: `PC_HOTKEYS` and `switchToTab` in `reconnectSaga-*.js` / `ui-process-*.js`.

## Connections (rebuild behaviour)
- Unknown server key: asked with "Add and continue" / "Continue" / "Close"; changed key warns. Fingerprints are SHA256.
- Login order: key (with passphrase), then password, then keyboard-interactive with the password; nothing saved → prompt.
- Credentials blank on a host are taken from its identity, then its parent groups.
- Port forwarding: Local (listen here, connect from server), Remote (server listens, connects here), Dynamic (SOCKS5).

## Host usage on host cards (added at the person's request; not in the original)
- Each saved host whose login works on its own (a saved username, a password or key, and an already trusted
  host key) shows CPU, RAM and, when it has one, battery under its subtitle on the Hosts screen.
- Refreshed every 10 s while the Hosts screen is open (the person's `watch -n 10`). One quiet SSH connection
  per host is kept between refreshes; it never asks for a password or a host key.
- Read with one command: two `/proc/stat` samples 1 s apart (busy = total − idle − iowait), `/proc/meminfo`
  (used = MemTotal − MemAvailable, or MemFree+Buffers+Cached on old kernels) and
  `/sys/class/power_supply/BAT*/capacity` + `status` (several batteries averaged). Linux hosts only.
- A failed login or unknown host key hides the line until that host's saved login changes; an unreachable
  host is tried again after 60 s (**estimated**). Colours: amber/red at CPU 70/90 %, RAM 75/90 %,
  battery 30/15 % (**estimated**). Settings → Terminal → "Show host usage on host cards" turns it off.
- While a host's first numbers are on their way, its card shows three shimmering grey placeholders (skeleton) in the same spot; later refreshes keep the last numbers instead.

## Keys on this computer (~/.ssh)
- The original's "Import from SSH" (`autoImportSshConfig`, ui-process `index-063ee049.js`) reads every file in
  `~/.ssh`, keeps the ones holding a private key (`keyPaths`), parses `config` for hosts and `known_hosts` for keys.
- Rebuild: Keychain > Key menu > "Import from this computer" (and "Keys on this computer" on the empty keychain)
  lists each private key with its type, SHA256 fingerprint and status (Ready, Needs passphrase, In keychain,
  Not supported). A locked key's fingerprint comes from its `.pub`. Imported keys keep their file path.
- A host's key menu has "From this computer (.ssh)". Hosts > Import > `~/.ssh/config` also brings the keys in
  `~/.ssh`, reusing a key already in the keychain (same fingerprint) instead of copying it again.
- Hosts with no key of their own try, before the password: keys imported from this computer (with the passphrase
  saved in Keychain), then up to 5 unlocked keys in `~/.ssh` (**estimated** limit), like the `ssh` command.
  Settings > Terminal > "Use this computer's SSH keys" turns this off.

## Motion
- Read from the original's UI bundle (Material defaults it builds on, `reconnectSaga-*.js`): durations shortest 150,
  shorter 200, short 250, standard 300, complex 375, entering 225, leaving 195 ms; curves easeInOut (.4,0,.2,1),
  easeOut (0,0,.2,1), easeIn (.4,0,1,1), sharp (.4,0,.6,1); its own hovers use `.2s`/`.3s all ease`.
- Rebuild: menus grow from their button (200 ms) and fade out (120 ms); dialogs and the dimmed backdrop fade in 225 ms
  and out 195 ms; the edit panel slides in 225 ms (easeOut) and out 195 ms (sharp); screens fade in 180 ms;
  new terminal tabs grow in; Grid/List switch eases the cards in; hovers 150-200 ms. Reduced-motion turns all off.

## Login order and key passphrases (rebuild)
- Host key: opened with its saved passphrase, or else with the host's password (people save the key passphrase there).
- Then this computer's keys (when on), then the password / keyboard-interactive only if the server still offers them.
- Errors: `KEY_PASSPHRASE` (key locked: the app asks for the key's passphrase and can save it with the key),
  `KEY_REFUSED` (server takes only keys and refused them), `AUTH_FAILED` (wrong password). Verified against the
  person's EC2 host (publickey only): the locked ed25519 key opens with the host's saved password and logs in.
