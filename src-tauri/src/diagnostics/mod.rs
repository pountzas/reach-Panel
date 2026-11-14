//! Crash capture: panic hook, unclean-exit marker, WebView2 process failure.
//! Breadcrumbs from #356 live in the sibling module.

pub(crate) mod breadcrumbs;
mod bundle;
mod crash;
mod report;
pub(crate) mod session;
mod webview;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{App, AppHandle, Manager, RunEvent, Runtime, WindowEvent};

pub(crate) use bundle::scrub_user_paths;
pub use bundle::{build_diagnostics_bundle, BundleFile, BundleOptions, MAX_NOTE_CHARS};
pub use crash::install_panic_hook;
pub use report::{collect_diagnostics_report, DiagnosticsInfo};
pub use session::{begin_session, logs_dir, mark_clean_exit};
pub use webview::register_process_failed;

static CLEAN_SHUTDOWN_LOGGED: AtomicBool = AtomicBool::new(false);
static PREVIOUS_SESSION: OnceLock<&'static str> = OnceLock::new();

pub fn previous_session_status() -> &'static str {
    PREVIOUS_SESSION.get().copied().unwrap_or("unknown")
}

pub fn log_setup_error(message: String) -> String {
    log::error!("{message}");
    message
}

pub fn on_setup<R: Runtime>(app: &App<R>) {
    let logs_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| session::default_logs_dir());
    let _ = session::LOGS_DIR.set(logs_dir.clone());
    crash::prune_crash_sidecars(&logs_dir);
    let _ = PREVIOUS_SESSION.set(report::marker_status(&session::read_marker(&logs_dir)));
    let version = app.package_info().version.to_string();
    if let Some(previous) = begin_session(&logs_dir, &version, std::process::id()) {
        log::warn!(
            "previous session ended uncleanly: reason={}, started_at={}, last_breadcrumb={}",
            previous.reason,
            previous.started_at,
            previous.last_breadcrumb
        );
    }
}

pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    match event {
        RunEvent::ExitRequested {
            code: None, api, ..
        } if webview::has_pending_recreate() => {
            api.prevent_exit();
        }
        RunEvent::ExitRequested { .. } | RunEvent::Exit => note_clean_shutdown(app),
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Destroyed,
            ..
        } => {
            webview::on_window_destroyed(app, label);
        }
        _ => {}
    }
}

fn note_clean_shutdown<R: Runtime>(app: &AppHandle<R>) {
    if CLEAN_SHUTDOWN_LOGGED.swap(true, Ordering::SeqCst) {
        return;
    }
    let Ok(logs_dir) = app.path().app_log_dir() else {
        return;
    };
    if mark_clean_exit(&logs_dir).is_ok() {
        log::info!("clean shutdown");
    }
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn cmd_debug_panic(app: AppHandle, on_main_thread: bool) {
    if on_main_thread {
        let _ = app.run_on_main_thread(|| panic!("debug panic on main thread"));
        return;
    }
    let _ = std::thread::Builder::new()
        .name("debug-panic-worker".into())
        .spawn(|| panic!("debug panic on worker thread"));
}
