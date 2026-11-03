//! Panic hook and crash sidecar next to rotating logs.

use super::session::{default_logs_dir, mark_panic};
use std::backtrace::Backtrace;
use std::fs;
use std::panic::PanicHookInfo;
use std::path::Path;
use std::thread;

pub fn install_panic_hook() {
    let logs_dir = default_logs_dir();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        report_panic(info, &logs_dir);
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
