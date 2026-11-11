//! Startup webview creation: which failures are worth retrying.

use tauri::Manager;

/// WebView2 `ERROR_BUSY` / `HRESULT 0x800700AA` ("The requested resource is in use.").
pub const WEBVIEW2_RESOURCE_IN_USE: i32 = 0x8007_00AA_u32 as i32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebviewCreateFailure {
    Retry,
    Fatal,
}

pub fn classify_webview_create_error(hresult: i32) -> WebviewCreateFailure {
    if hresult == WEBVIEW2_RESOURCE_IN_USE {
        WebviewCreateFailure::Retry
    } else {
        WebviewCreateFailure::Fatal
    }
}

/// Five create attempts. Waits between the retries add up to 5 seconds.
pub const STARTUP_CREATE_ATTEMPTS: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateRetry {
    WaitMs(u64),
    Stop,
}

pub fn after_create_failure(attempt: u32, failure: WebviewCreateFailure) -> CreateRetry {
    if failure != WebviewCreateFailure::Retry || attempt + 1 >= STARTUP_CREATE_ATTEMPTS {
        return CreateRetry::Stop;
    }
    if attempt == 3 {
        CreateRetry::WaitMs(2_000)
    } else {
        CreateRetry::WaitMs(1_000)
    }
}

pub fn hresult_from_webview_error(message: &str) -> Option<i32> {
    let start = message.find("0x").or_else(|| message.find("0X"))?;
    let hex: String = message[start + 2..]
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .collect();
    if hex.is_empty() {
        return None;
    }
    u32::from_str_radix(&hex, 16).ok().map(|value| value as i32)
}

pub const WEBVIEW_BUSY_MESSAGE: &str = "ReachPanel is already running or WebView2 is busy; close other ReachPanel windows and try again.";
pub const WEBVIEW_BUSY_EXIT_CODE: i32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecondInstanceAction {
    ShowMain,
    Ignore,
}

pub fn second_instance_action(has_main: bool) -> SecondInstanceAction {
    if has_main {
        SecondInstanceAction::ShowMain
    } else {
        SecondInstanceAction::Ignore
    }
}

pub fn redact_user_data_dir(path: &str, username: &str, user_profile: &str) -> String {
    crate::diagnostics::scrub_user_paths(path, username, user_profile)
}

pub fn webview_create_failure_log(
    attempt: u32,
    hresult: Option<i32>,
    redacted_dir: &str,
    scrubbed_error: &str,
) -> String {
    let code = match hresult {
        Some(value) => format!("0x{value:08X}"),
        None => "none".to_string(),
    };
    format!(
        "webview create attempt {attempt} hresult={code} user_data={redacted_dir} error={scrubbed_error}"
    )
}

pub fn on_second_instance(app: &tauri::AppHandle) {
    if second_instance_action(app.get_webview_window("main").is_some())
        != SecondInstanceAction::ShowMain
    {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
    }
}

pub fn open_main_window(app: &tauri::AppHandle) {
    let Some(conf) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
    else {
        give_up("main window config missing");
    };

    let username = std::env::var("USERNAME").unwrap_or_default();
    let profile = std::env::var("USERPROFILE").unwrap_or_default();
    let user_data = app
        .path()
        .app_data_dir()
        .map(|dir| dir.display().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let redacted_dir = redact_user_data_dir(&user_data, &username, &profile);

    let mut attempt = 0u32;
    loop {
        let built = tauri::WebviewWindowBuilder::from_config(app, &conf)
            .and_then(|builder| builder.build());
        match built {
            Ok(window) => {
                crate::window::configure_main_window(&window);
                crate::window::events::register_main_window_event_logs(window.clone());
                crate::input::focus_target::init(app.clone());
                crate::input::input_preview::init(app.clone());
                crate::diagnostics::register_process_failed(&window);
                return;
            }
            Err(err) => {
                let raw = err.to_string();
                let code = hresult_from_webview_error(&raw);
                let failure = code
                    .map(classify_webview_create_error)
                    .unwrap_or(WebviewCreateFailure::Fatal);
                let scrubbed = redact_user_data_dir(&raw, &username, &profile);
                log::error!(
                    "{}",
                    webview_create_failure_log(attempt + 1, code, &redacted_dir, &scrubbed)
                );
                match after_create_failure(attempt, failure) {
                    CreateRetry::WaitMs(delay_ms) => {
                        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                        attempt += 1;
                    }
                    CreateRetry::Stop => give_up(&scrubbed),
                }
            }
        }
    }
}

fn give_up(scrubbed_error: &str) -> ! {
    log::error!("webview create failed: {scrubbed_error}");
    show_webview_busy_dialog();
    std::process::exit(WEBVIEW_BUSY_EXIT_CODE);
}

fn show_webview_busy_dialog() {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let text = utf16(WEBVIEW_BUSY_MESSAGE);
    let title = utf16("ReachPanel");
    unsafe {
        let _ = MessageBoxW(
            None,
            PCWSTR(text.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}

fn utf16(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_in_use_is_retryable() {
        assert_eq!(
            classify_webview_create_error(WEBVIEW2_RESOURCE_IN_USE),
            WebviewCreateFailure::Retry
        );
    }

    #[test]
    fn other_hresults_are_fatal() {
        assert_eq!(
            classify_webview_create_error(0x8000_4005_u32 as i32),
            WebviewCreateFailure::Fatal
        );
    }

    #[test]
    fn busy_webview_waits_then_stops_after_five_tries() {
        assert_eq!(
            after_create_failure(0, WebviewCreateFailure::Retry),
            CreateRetry::WaitMs(1_000)
        );
        assert_eq!(
            after_create_failure(1, WebviewCreateFailure::Retry),
            CreateRetry::WaitMs(1_000)
        );
        assert_eq!(
            after_create_failure(2, WebviewCreateFailure::Retry),
            CreateRetry::WaitMs(1_000)
        );
        assert_eq!(
            after_create_failure(3, WebviewCreateFailure::Retry),
            CreateRetry::WaitMs(2_000)
        );
        assert_eq!(
            after_create_failure(4, WebviewCreateFailure::Retry),
            CreateRetry::Stop
        );
    }

    #[test]
    fn fatal_create_error_stops_immediately() {
        assert_eq!(
            after_create_failure(0, WebviewCreateFailure::Fatal),
            CreateRetry::Stop
        );
    }

    #[test]
    fn reads_resource_in_use_hresult_from_webview_error() {
        let message = "Failed to setup app: failed to create webview: WebView2 error: The requested resource is in use. (HRESULT 0x800700AA)";
        assert_eq!(
            hresult_from_webview_error(message),
            Some(WEBVIEW2_RESOURCE_IN_USE)
        );
    }

    #[test]
    fn busy_dialog_tells_the_user_to_close_other_windows() {
        assert_eq!(
            WEBVIEW_BUSY_MESSAGE,
            "ReachPanel is already running or WebView2 is busy; close other ReachPanel windows and try again."
        );
        assert_eq!(WEBVIEW_BUSY_EXIT_CODE, 2);
    }

    #[test]
    fn second_launch_shows_the_existing_panel() {
        assert_eq!(second_instance_action(true), SecondInstanceAction::ShowMain);
        assert_eq!(second_instance_action(false), SecondInstanceAction::Ignore);
    }

    #[test]
    fn user_data_dir_log_hides_the_account_name() {
        let path = r"C:\Users\ada\AppData\Local\com.nik.reach-panel\EBWebView";
        let redacted = redact_user_data_dir(path, "ada", r"C:\Users\ada");
        assert_eq!(
            redacted,
            r"%USERPROFILE%\AppData\Local\com.nik.reach-panel\EBWebView"
        );
        let line = webview_create_failure_log(
            1,
            Some(WEBVIEW2_RESOURCE_IN_USE),
            &redacted,
            "HRESULT 0x800700AA",
        );
        assert_eq!(
            line,
            r"webview create attempt 1 hresult=0x800700AA user_data=%USERPROFILE%\AppData\Local\com.nik.reach-panel\EBWebView error=HRESULT 0x800700AA"
        );
        assert!(!line.to_ascii_lowercase().contains("ada"));
    }

    #[test]
    fn main_window_is_not_created_from_config() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let main = conf["app"]["windows"]
            .as_array()
            .expect("app.windows")
            .iter()
            .find(|window| window["label"] == "main")
            .expect("main window");
        assert_eq!(main["create"], false);
    }

    #[test]
    fn single_instance_plugin_is_registered_first() {
        let cargo = include_str!("../Cargo.toml");
        assert!(
            cargo.contains("tauri-plugin-single-instance"),
            "missing tauri-plugin-single-instance"
        );
        let src = include_str!("lib.rs");
        let single = src
            .find("tauri_plugin_single_instance::init")
            .expect("single instance plugin");
        let opener = src
            .find("tauri_plugin_opener::init")
            .expect("opener plugin");
        assert!(single < opener);
    }
}
