//! Live preview while the app is being built (debug builds started from the project only):
//! - the window's files are read from `ui/` on disk, and the window reloads when they change
//!   (style changes are swapped in without a reload);
//! - the app runs from a copy of itself, so a new build can replace the program, and when a new
//!   build appears it restarts on its own.
//! Release builds and copies used elsewhere never do any of this.

use std::borrow::Cow;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{Assets, Manager, Runtime};

const CHILD_ENV: &str = "SHELLBOX_LIVE_SOURCE";

pub fn ui_dir() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ui");
    dir.join("index.html").exists().then_some(dir)
}

/// Starts the app from a copy of the program and returns true when this process should exit.
pub fn relaunch_from_copy() -> bool {
    if ui_dir().is_none() || std::env::var_os(CHILD_ENV).is_some() || std::env::var_os("SHELLBOX_NO_LIVE").is_some() {
        return false;
    }
    let Ok(exe) = std::env::current_exe() else { return false };
    let Some(dir) = exe.parent() else { return false };
    // Remove copies left by earlier runs (the ones still running can't be removed and stay).
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("shellbox-live-") && n.ends_with(".exe") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let copy = dir.join(format!("shellbox-live-{}.exe", std::process::id()));
    if std::fs::copy(&exe, &copy).is_err() {
        return false;
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::Command::new(&copy).args(args).env(CHILD_ENV, &exe).spawn().is_ok()
}

/// Stand-in used only while swapping the asset provider.
pub struct NoAssets;

impl<R: Runtime> Assets<R> for NoAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

pub struct LiveAssets<R: Runtime> {
    pub dir: PathBuf,
    pub fallback: Box<dyn Assets<R>>,
}

impl<R: Runtime> Assets<R> for LiveAssets<R> {
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let rel = key.as_ref().trim_start_matches('/');
        let path = self.dir.join(if rel.is_empty() { "index.html" } else { rel });
        if path.starts_with(&self.dir) {
            if let Ok(bytes) = std::fs::read(&path) {
                return Some(Cow::Owned(bytes));
            }
        }
        self.fallback.get(key)
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.fallback.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.fallback.csp_hashes(html_path)
    }
}

fn newest(dir: &Path, css_only: bool) -> SystemTime {
    let mut best = SystemTime::UNIX_EPOCH;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                if !p.ends_with("vendor") {
                    stack.push(p);
                }
                continue;
            }
            let is_css = p.extension().is_some_and(|x| x == "css");
            if css_only != is_css {
                continue;
            }
            if let Ok(t) = e.metadata().and_then(|m| m.modified()) {
                best = best.max(t);
            }
        }
    }
    best
}

/// Watches the window files and the program itself.
pub fn watch<R: Runtime>(app: tauri::AppHandle<R>, dir: PathBuf) {
    let source = std::env::var_os(CHILD_ENV).map(PathBuf::from);
    std::thread::spawn(move || {
        let mtime = |p: &Path| std::fs::metadata(p).and_then(|m| m.modified()).ok();
        let mut css = newest(&dir, true);
        let mut code = newest(&dir, false);
        let mut prog = source.as_deref().and_then(mtime);
        loop {
            std::thread::sleep(Duration::from_millis(600));
            let c = newest(&dir, true);
            if c != css {
                css = c;
                for w in app.webview_windows().values() {
                    let _ = w.eval("document.querySelectorAll('link[rel=stylesheet]').forEach(l=>{const u=new URL(l.href);u.searchParams.set('v',Date.now());l.href=u.href})");
                }
            }
            let j = newest(&dir, false);
            if j != code {
                code = j;
                for w in app.webview_windows().values() {
                    let _ = w.eval("location.reload()");
                }
            }
            if let Some(src) = &source {
                let now = mtime(src);
                if now.is_some() && now != prog {
                    // Wait until the new program is completely written.
                    std::thread::sleep(Duration::from_millis(1500));
                    if mtime(src) != now {
                        continue;
                    }
                    prog = now;
                    let Some(dir) = src.parent() else { continue };
                    let copy = dir.join(format!("shellbox-live-{}-{}.exe", std::process::id(), SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
                    if std::fs::copy(src, &copy).is_ok()
                        && std::process::Command::new(&copy).env(CHILD_ENV, src).spawn().is_ok()
                    {
                        app.exit(0);
                        return;
                    }
                }
            }
        }
    });
}
