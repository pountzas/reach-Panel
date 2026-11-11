//! WebView2 `ProcessFailed` logging and recovery for ReachPanel windows.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2ProcessFailedEventArgs, ICoreWebView2ProcessFailedEventArgs2,
    COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
    COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED, COREWEBVIEW2_PROCESS_FAILED_REASON,
    COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED, COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED,
    COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY,
    COREWEBVIEW2_PROCESS_FAILED_REASON_PROFILE_DELETED,
    COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED, COREWEBVIEW2_PROCESS_FAILED_REASON_UNEXPECTED,
    COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE,
};
use webview2_com::ProcessFailedEventHandler;
use windows_core::Interface;

const WATCHED_LABELS: [&str; 2] = ["main", "settings"];

static REGISTERED: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static PENDING_RECREATE: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static LAST_RECOVERY: Mutex<Option<HashMap<String, Instant>>> = Mutex::new(None);

fn registered() -> std::sync::MutexGuard<'static, Option<HashSet<String>>> {
    REGISTERED.lock().unwrap_or_else(|e| e.into_inner())
}

fn pending_recreate() -> std::sync::MutexGuard<'static, Option<HashSet<String>>> {
    PENDING_RECREATE.lock().unwrap_or_else(|e| e.into_inner())
}

fn take_pending_recreate(label: &str) -> bool {
    pending_recreate()
        .as_mut()
        .is_some_and(|set| set.remove(label))
}

pub fn has_pending_recreate() -> bool {
    pending_recreate()
        .as_ref()
        .is_some_and(|set| !set.is_empty())
}

fn is_pending_recreate(label: &str) -> bool {
    pending_recreate()
        .as_ref()
        .is_some_and(|set| set.contains(label))
}

fn recovery_allowed(label: &str) -> bool {
    let mut guard = LAST_RECOVERY.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    let now = Instant::now();
    if map
        .get(label)
        .is_some_and(|then| now.duration_since(*then) < Duration::from_secs(5))
    {
        return false;
    }
    map.insert(label.to_string(), now);
    true
}

/// Called from `RunEvent::WindowEvent { event: Destroyed }`.
pub fn on_window_destroyed<R: Runtime>(app: &AppHandle<R>, label: &str) {
    unregister(label);
    if !is_pending_recreate(label) {
        return;
    }
    let app_for_main = app.clone();
    let label = label.to_string();
    let _ = app.run_on_main_thread(move || {
        let result = recreate_window(&app_for_main, &label);
        take_pending_recreate(&label);
        match result {
            Ok(()) => log::warn!("ProcessFailed: recreated webview window label={label}"),
            Err(e) => log::error!("ProcessFailed: failed to recreate window label={label}: {e}"),
        }
    });
}

pub fn unregister(label: &str) {
    if let Some(set) = registered().as_mut() {
        set.remove(label);
    }
}

pub fn register_process_failed<R: Runtime>(window: &WebviewWindow<R>) {
    let label = window.label().to_string();
    if !WATCHED_LABELS.contains(&label.as_str()) {
        return;
    }
    {
        let mut guard = registered();
        let set = guard.get_or_insert_with(HashSet::new);
        if !set.insert(label.clone()) {
            return;
        }
    }

    let app = window.app_handle().clone();
    let label_for_webview = label.clone();
    if let Err(e) = window.with_webview(move |platform| {
        let controller = platform.controller();
        let webview = match unsafe { controller.CoreWebView2() } {
            Ok(webview) => webview,
            Err(e) => {
                log::error!("ProcessFailed: no ICoreWebView2 for label={label_for_webview}: {e}");
                unregister(&label_for_webview);
                return;
            }
        };
        let handler_label = label_for_webview.clone();
        let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
            on_process_failed(&app, &handler_label, args);
            Ok(())
        }));
        let mut token = 0i64;
        if let Err(e) = unsafe { webview.add_ProcessFailed(&handler, &mut token) } {
            log::error!("ProcessFailed: register failed label={label_for_webview}: {e}");
            unregister(&label_for_webview);
        }
    }) {
        log::error!("ProcessFailed: with_webview failed label={label}: {e}");
        unregister(&label);
    }
}

fn on_process_failed<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    args: Option<ICoreWebView2ProcessFailedEventArgs>,
) {
    let Some(args) = args else {
        return;
    };
    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
    let _ = unsafe { args.ProcessFailedKind(&mut kind) };
    let (reason, exit_code) = unsafe { failed_reason_and_exit(&args) };
    log::error!(
        "ProcessFailed label={label} kind={} reason={reason} exit_code={exit_code}",
        kind_name(kind)
    );
    if !recovery_allowed(label) {
        log::error!("ProcessFailed: recovery throttled label={label}");
        return;
    }

    let recreate = kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED;
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        let app_for_recover = app.clone();
        let _ = app.run_on_main_thread(move || recover_window(&app_for_recover, &label, recreate));
    });
}

unsafe fn failed_reason_and_exit(args: &ICoreWebView2ProcessFailedEventArgs) -> (String, i32) {
    let Ok(args2) = Interface::cast::<ICoreWebView2ProcessFailedEventArgs2>(args) else {
        return ("unknown".into(), 0);
    };
    let mut reason = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
    let mut exit_code = 0i32;
    let _ = args2.Reason(&mut reason);
    let _ = args2.ExitCode(&mut exit_code);
    (reason_name(reason).into(), exit_code)
}

fn recover_window<R: Runtime>(app: &AppHandle<R>, label: &str, recreate: bool) {
    if recreate {
        match app.get_webview_window(label) {
            Some(window) => {
                pending_recreate()
                    .get_or_insert_with(HashSet::new)
                    .insert(label.to_string());
                if let Err(e) = window.destroy() {
                    take_pending_recreate(label);
                    log::error!("ProcessFailed: destroy failed label={label}: {e}");
                }
            }
            None => match recreate_window(app, label) {
                Ok(()) => log::error!("ProcessFailed: recreated webview window label={label}"),
                Err(e) => {
                    log::error!("ProcessFailed: failed to recreate window label={label}: {e}")
                }
            },
        }
        return;
    }
    match app.get_webview_window(label) {
        Some(window) => match window.reload() {
            Ok(()) => log::error!("ProcessFailed: reloaded window label={label}"),
            Err(e) => log::error!("ProcessFailed: reload failed label={label}: {e}"),
        },
        None => log::error!("ProcessFailed: window gone, cannot reload label={label}"),
    }
}

fn recreate_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    if label == "main" {
        let conf = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "main")
            .cloned()
            .ok_or_else(|| "main window config missing".to_string())?;
        tauri::WebviewWindowBuilder::from_config(app, &conf)
            .and_then(|builder| builder.build())
            .map(|_| ())
            .map_err(|e| e.to_string())?;
        if let Some(window) = app.get_webview_window("main") {
            crate::window::configure_main_window(&window);
            register_process_failed(&window);
        }
        return Ok(());
    }

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App("/".into()))
            .decorations(false)
            .transparent(true)
            .always_on_top(true);
    if label == "settings" {
        // TOOL_WINDOW_SIZE in src/lib/toolWindows.ts
        builder = builder
            .title("Settings")
            .inner_size(900.0, 700.0)
            .center()
            .resizable(true)
            .focused(true);
        if !is_pending_recreate("main") {
            if let Some(main) = app.get_webview_window("main") {
                builder = builder.parent(&main).map_err(|e| e.to_string())?;
            }
        }
    }
    builder.build().map(|_| ()).map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window(label) {
        register_process_failed(&window);
    }
    Ok(())
}

fn kind_name(kind: COREWEBVIEW2_PROCESS_FAILED_KIND) -> &'static str {
    if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
        "BROWSER_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
        "RENDER_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
        "RENDER_PROCESS_UNRESPONSIVE"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED {
        "FRAME_RENDER_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED {
        "UTILITY_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED {
        "SANDBOX_HELPER_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED {
        "GPU_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED {
        "PPAPI_PLUGIN_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED {
        "PPAPI_BROKER_PROCESS_EXITED"
    } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED {
        "UNKNOWN_PROCESS_EXITED"
    } else {
        "UNKNOWN"
    }
}

fn reason_name(reason: COREWEBVIEW2_PROCESS_FAILED_REASON) -> &'static str {
    if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_UNEXPECTED {
        "UNEXPECTED"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE {
        "UNRESPONSIVE"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED {
        "TERMINATED"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED {
        "CRASHED"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED {
        "LAUNCH_FAILED"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY {
        "OUT_OF_MEMORY"
    } else if reason == COREWEBVIEW2_PROCESS_FAILED_REASON_PROFILE_DELETED {
        "PROFILE_DELETED"
    } else {
        "UNKNOWN"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The recreate set is process-global. Cargo runs these tests in parallel.
    fn lock_pending_recreate_tests() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: Mutex<()> = Mutex::new(());
        LOCK.lock().unwrap_or_else(|err| err.into_inner())
    }

    #[test]
    fn pending_recreate_insert_take_and_empty() {
        let _lock = lock_pending_recreate_tests();
        {
            let mut guard = pending_recreate();
            if let Some(set) = guard.as_mut() {
                set.clear();
            }
        }
        assert!(!has_pending_recreate());
        assert!(!take_pending_recreate("unit-main"));
        pending_recreate()
            .get_or_insert_with(HashSet::new)
            .insert("unit-main".into());
        assert!(has_pending_recreate());
        assert!(take_pending_recreate("unit-main"));
        assert!(!has_pending_recreate());
        assert!(!take_pending_recreate("unit-main"));
    }

    #[test]
    fn pending_recreate_stays_set_until_the_recreate_closure_takes_it() {
        let _lock = lock_pending_recreate_tests();
        let label = "unit-destroy-order";
        {
            let mut guard = pending_recreate();
            if let Some(set) = guard.as_mut() {
                set.remove(label);
            }
        }
        pending_recreate()
            .get_or_insert_with(HashSet::new)
            .insert(label.into());
        assert!(is_pending_recreate(label));
        assert!(has_pending_recreate());
        take_pending_recreate(label);
        assert!(!is_pending_recreate(label));
    }

    #[test]
    fn recovery_is_throttled_within_five_seconds() {
        let label = "unit-test-recovery-throttle";
        assert!(recovery_allowed(label));
        assert!(!recovery_allowed(label));
    }
}
