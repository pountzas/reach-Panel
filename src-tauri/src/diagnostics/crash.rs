//! Panic hook and crash sidecar next to rotating logs.

use super::session::mark_panic;
use std::backtrace::Backtrace;
use std::fs;
use std::panic::PanicHookInfo;
use std::path::Path;
use std::thread;

pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        report_panic(info, &super::session::logs_dir());
        previous(info);
    }));
}

fn report_panic(info: &PanicHookInfo<'_>, logs_dir: &Path) {
    let thread = thread::current().name().unwrap_or("unnamed").to_string();
    let location = info
        .location()
        .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
        .unwrap_or_else(|| "unknown".into());
    let payload = panic_payload(info);
    let backtrace = Backtrace::force_capture();
    let body = format!("panic thread={thread} location={location} payload={payload}\n{backtrace}");
    log::error!("{body}");
    write_crash_sidecar(logs_dir, &body);
    let _ = mark_panic(logs_dir);
}

fn panic_payload(info: &PanicHookInfo<'_>) -> String {
    if let Some(payload) = info.payload_as_str() {
        return payload.to_string();
    }
    if let Some(payload) = info.payload().downcast_ref::<String>() {
        return payload.clone();
    }
    if let Some(payload) = info.payload().downcast_ref::<&str>() {
        return (*payload).to_string();
    }
    "Box<dyn Any>".into()
}

fn write_crash_sidecar(logs_dir: &Path, body: &str) {
    let _ = fs::create_dir_all(logs_dir);
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let path = logs_dir.join(format!("crash-{stamp}.txt"));
    let _ = fs::write(path, body);
}

pub const KEEP_CRASH_SIDECARS: usize = 10;

pub fn prune_crash_sidecars(logs_dir: &Path) {
    let Ok(entries) = fs::read_dir(logs_dir) else {
        return;
    };
    let mut crashes: Vec<(String, std::path::PathBuf)> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_crash_sidecar(path))
        .filter_map(|path| {
            let name = path.file_name()?.to_str()?.to_string();
            Some((name, path))
        })
        .collect();
    crashes.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in crashes.into_iter().skip(KEEP_CRASH_SIDECARS) {
        let _ = fs::remove_file(path);
    }
}

fn is_crash_sidecar(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("crash-") && name.ends_with(".txt"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_logs() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-crash-prune-{nanos}"));
        fs::create_dir_all(&dir).expect("temp logs dir");
        dir
    }

    fn list_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("read dir")
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn prune_keeps_ten_newest_crash_sidecars_and_leaves_other_files() {
        let dir = temp_logs();
        fs::write(dir.join("reach-panel.log"), "current\n").expect("log");
        fs::write(dir.join("reach-panel.log.1"), "rotated\n").expect("rotated");
        fs::write(dir.join("breadcrumbs.log"), "crumb\n").expect("breadcrumbs");
        fs::write(dir.join("session.json"), "{}\n").expect("session");
        for i in 1..=12 {
            let name = format!("crash-20260101T0000{i:02}.000Z.txt");
            fs::write(dir.join(&name), format!("crash {i}\n")).expect("crash sidecar");
        }

        prune_crash_sidecars(&dir);

        let names = list_names(&dir);
        let crashes: Vec<_> = names
            .iter()
            .filter(|name| name.starts_with("crash-") && name.ends_with(".txt"))
            .cloned()
            .collect();
        assert_eq!(crashes.len(), KEEP_CRASH_SIDECARS);
        assert!(!names.iter().any(|n| n == "crash-20260101T000001.000Z.txt"));
        assert!(!names.iter().any(|n| n == "crash-20260101T000002.000Z.txt"));
        assert!(names.iter().any(|n| n == "crash-20260101T000003.000Z.txt"));
        assert!(names.iter().any(|n| n == "crash-20260101T000012.000Z.txt"));
        assert!(names.iter().any(|n| n == "reach-panel.log"));
        assert!(names.iter().any(|n| n == "reach-panel.log.1"));
        assert!(names.iter().any(|n| n == "breadcrumbs.log"));
        assert!(names.iter().any(|n| n == "session.json"));
    }
}
