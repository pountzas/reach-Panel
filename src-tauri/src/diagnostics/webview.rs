//! WebView2 `ProcessFailed` logging and recovery for ReachPanel windows.

use std::collections::HashSet;
use std::sync::Mutex;
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

const WATCHED_LABELS: [&str; 3] = ["main", "settings", "dictation-overlay"];

static REGISTERED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn registered() -> std::sync::MutexGuard<'static, Option<HashSet<String>>> {
    REGISTERED.lock().unwrap_or_else(|e| e.into_inner())
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
        unregister(label);
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
        match recreate_window(app, label) {
            Ok(()) => log::error!("ProcessFailed: recreated webview window label={label}"),
            Err(e) => log::error!("ProcessFailed: failed to recreate window label={label}: {e}"),
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
        builder = builder.title("Settings").resizable(true);
        if let Some(main) = app.get_webview_window("main") {
            builder = builder.parent(&main).map_err(|e| e.to_string())?;
        }
    } else if label == "dictation-overlay" {
        builder = builder
            .title("Dictation")
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .visible(false);
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
