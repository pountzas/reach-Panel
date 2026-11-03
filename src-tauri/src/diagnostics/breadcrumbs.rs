//! In-memory breadcrumb ring flushed to `breadcrumbs.log`.
//!
//! Debug layout/window events live here so rotating `reach-panel.log` can stay
//! at Info. Do not log typed or dictated text, clipboard, keys, or settings JSON.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};

pub const RING_CAPACITY: usize = 200;
const FLUSH_INTERVAL: std::time::Duration = std::time::Duration::from_secs(2);

/// Last-N breadcrumb lines. Oldest entries drop when full.
pub struct BreadcrumbRing {
    capacity: usize,
    entries: VecDeque<String>,
}

impl BreadcrumbRing {
    #[cfg(test)]
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            entries: VecDeque::with_capacity(capacity.max(1)),
        }
    }

    pub fn push(&mut self, line: impl Into<String>) {
        if self.entries.len() == self.capacity {
            self.entries.pop_front();
        }
        self.entries.push_back(line.into());
    }

    #[cfg(test)]
    pub fn snapshot(&self) -> Vec<String> {
        self.entries.iter().cloned().collect()
    }

    fn render(&self) -> String {
        let mut text = self.entries.iter().cloned().collect::<Vec<_>>().join("\n");
        if !text.is_empty() {
            text.push('\n');
        }
        text
    }

    pub fn flush_to(&self, path: &Path) -> std::io::Result<()> {
        write_atomic(path, &self.render())
    }
}

/// Write to `<path>.tmp` then rename over `path`, so a kill mid-write never leaves a truncated log.
fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("log.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

static RING: Mutex<BreadcrumbRing> = Mutex::new(BreadcrumbRing {
    capacity: RING_CAPACITY,
    entries: VecDeque::new(),
});
static FLUSH_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
static START: Once = Once::new();
static FLUSH_IO: Mutex<()> = Mutex::new(());

fn lock_ring() -> std::sync::MutexGuard<'static, BreadcrumbRing> {
    RING.lock().unwrap_or_else(|e| e.into_inner())
}

fn lock_path() -> std::sync::MutexGuard<'static, Option<PathBuf>> {
    FLUSH_PATH.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn record(line: impl Into<String>) {
    lock_ring().push(line);
}

pub fn emit(level: log::Level, target: &'static str, message: impl AsRef<str>) {
    let message = message.as_ref();
    let ts = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f");
    record(format!("{ts} {level:<5} {target} {message}"));
    match level {
        log::Level::Error => log::error!(target: target, "{message}"),
        log::Level::Warn => log::warn!(target: target, "{message}"),
        log::Level::Info => log::info!(target: target, "{message}"),
        log::Level::Debug => log::debug!(target: target, "{message}"),
        log::Level::Trace => log::trace!(target: target, "{message}"),
    }
}

pub fn debug(target: &'static str, message: impl AsRef<str>) {
    emit(log::Level::Debug, target, message);
}

/// Frontend breadcrumb into the ring only (rotating log stays Info). Never pass typed/dictated text.
#[tauri::command]
pub fn cmd_record_breadcrumb(scope: String, message: String) {
    let scope: String = scope.chars().take(32).collect();
    let message: String = message.chars().take(512).collect();
    debug("webview", format!("{scope}: {message}"));
}

pub fn info(target: &'static str, message: impl AsRef<str>) {
    emit(log::Level::Info, target, message);
}

pub fn warn(target: &'static str, message: impl AsRef<str>) {
    emit(log::Level::Warn, target, message);
}

pub fn flush() {
    let Some(path) = lock_path().clone() else {
        return;
    };
    let text = lock_ring().render();
    let _io = FLUSH_IO.lock().unwrap_or_else(|e| e.into_inner());
    let _ = write_atomic(&path, &text);
}

pub fn start(log_dir: PathBuf) {
    START.call_once(move || {
        let path = log_dir.join("breadcrumbs.log");
        *lock_path() = Some(path);
        flush();
        let _ = std::thread::Builder::new()
            .name("breadcrumb-flush".into())
            .spawn(|| loop {
                std::thread::sleep(FLUSH_INTERVAL);
                flush();
            });
    });
}

#[cfg(test)]
mod tests {
    use super::BreadcrumbRing;
    use std::fs;

    #[test]
    fn drops_oldest_when_over_capacity() {
        let mut ring = BreadcrumbRing::new(200);
        for i in 0..201 {
            ring.push(format!("e{i}"));
        }
        let snapshot = ring.snapshot();
        assert_eq!(snapshot.len(), 200);
        assert_eq!(snapshot[0], "e1");
        assert_eq!(snapshot[199], "e200");
    }

    #[test]
    fn snapshot_preserves_insertion_order() {
        let mut ring = BreadcrumbRing::new(4);
        ring.push("a");
        ring.push("b");
        ring.push("c");
        assert_eq!(ring.snapshot(), vec!["a", "b", "c"]);
    }

    #[test]
    fn flush_to_writes_current_entries_and_overwrites() {
        let mut ring = BreadcrumbRing::new(8);
        ring.push("first");
        ring.push("second");
        let dir = std::env::temp_dir().join(format!(
            "reach-panel-breadcrumbs-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("breadcrumbs.log");
        ring.flush_to(&path).expect("flush");
        assert!(!dir.join("breadcrumbs.log.tmp").exists());
        let text = fs::read_to_string(&path).expect("read");
        assert_eq!(text, "first\nsecond\n");

        ring.push("third");
        ring.flush_to(&path).expect("second flush");
        let text = fs::read_to_string(&path).expect("reread");
        assert_eq!(text, "first\nsecond\nthird\n");

        let _ = fs::remove_dir_all(&dir);
    }
}
