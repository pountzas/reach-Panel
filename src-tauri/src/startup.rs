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
pub const WEBVIEW_FAILED_MESSAGE: &str = "ReachPanel couldn't open its window. Restart Windows or reinstall the Microsoft Edge WebView2 Runtime, then try again.";
pub const WEBVIEW_BUSY_EXIT_CODE: i32 = 2;

pub fn startup_user_message(failure: WebviewCreateFailure, hresult: Option<i32>) -> String {
    if failure == WebviewCreateFailure::Retry {
        return WEBVIEW_BUSY_MESSAGE.to_string();
    }
    match hresult {
        Some(code) => format!("{WEBVIEW_FAILED_MESSAGE} (HRESULT 0x{code:08X})"),
        None => WEBVIEW_FAILED_MESSAGE.to_string(),
    }
}

pub fn create_with_retry<T>(
    mut build: impl FnMut() -> Result<T, String>,
    mut sleep_ms: impl FnMut(u64),
    mut on_failure: impl FnMut(u32, Option<i32>, &str),
) -> Result<T, (WebviewCreateFailure, String)> {
    let mut attempt = 0u32;
    loop {
        match build() {
            Ok(value) => return Ok(value),
            Err(raw) => {
                let code = hresult_from_webview_error(&raw);
                let failure = code
                    .map(classify_webview_create_error)
                    .unwrap_or(WebviewCreateFailure::Fatal);
                on_failure(attempt + 1, code, &raw);
                match after_create_failure(attempt, failure) {
                    CreateRetry::WaitMs(delay_ms) => {
                        sleep_ms(delay_ms);
                        attempt += 1;
                    }
                    CreateRetry::Stop => return Err((failure, raw)),
                }
            }
        }
    }
}

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
        give_up("main window config missing", WEBVIEW_FAILED_MESSAGE);
    };

    let username = std::env::var("USERNAME").unwrap_or_default();
    let profile = std::env::var("USERPROFILE").unwrap_or_default();
    let user_data = app
        .path()
        .app_data_dir()
        .map(|dir| dir.display().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let redacted_dir = redact_user_data_dir(&user_data, &username, &profile);

    let created = create_with_retry(
        || {
            tauri::WebviewWindowBuilder::from_config(app, &conf)
                .and_then(|builder| builder.build())
                .map_err(|err| err.to_string())
        },
        |delay_ms| std::thread::sleep(std::time::Duration::from_millis(delay_ms)),
        |attempt, code, raw| {
            let scrubbed = redact_user_data_dir(raw, &username, &profile);
            log::error!(
                "{}",
                webview_create_failure_log(attempt, code, &redacted_dir, &scrubbed)
            );
        },
    );
    match created {
        Ok(window) => {
            crate::window::configure_main_window(&window);
            crate::window::events::register_main_window_event_logs(window.clone());
            crate::input::focus_target::init(app.clone());
            crate::input::input_preview::init(app.clone());
            crate::diagnostics::register_process_failed(&window);
        }
        Err((failure, raw)) => {
            let scrubbed = redact_user_data_dir(&raw, &username, &profile);
            let message = startup_user_message(failure, hresult_from_webview_error(&raw));
            give_up(&scrubbed, &message);
        }
    }
}

fn give_up(scrubbed_error: &str, user_message: &str) -> ! {
    log::error!("webview create failed: {scrubbed_error}");
    let _ = crate::diagnostics::session::mark_exit_reason(
        &crate::diagnostics::session::logs_dir(),
        "webview_create_failed",
    );
    show_error_dialog(user_message);
    std::process::exit(WEBVIEW_BUSY_EXIT_CODE);
}

fn show_error_dialog(user_message: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let text = utf16(user_message);
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
    fn fatal_dialog_names_the_hresult_and_not_a_busy_panel() {
        let message =
            startup_user_message(WebviewCreateFailure::Fatal, Some(0x8000_4005_u32 as i32));
        assert!(message.contains("0x80004005"));
        assert!(!message.contains("already running"));
        assert_eq!(
            startup_user_message(WebviewCreateFailure::Retry, Some(WEBVIEW2_RESOURCE_IN_USE)),
            WEBVIEW_BUSY_MESSAGE
        );
    }

    #[test]
    fn retry_then_success_builds_three_times_and_sleeps_twice() {
        let mut builds = 0u32;
        let mut sleeps = Vec::new();
        let result = create_with_retry(
            || {
                builds += 1;
                if builds < 3 {
                    Err("HRESULT 0x800700AA".into())
                } else {
                    Ok("window")
                }
            },
            |ms| sleeps.push(ms),
            |_attempt, _code, _raw| {},
        );
        assert_eq!(result, Ok("window"));
        assert_eq!(builds, 3);
        assert_eq!(sleeps, vec![1_000, 1_000]);
    }

    #[test]
    fn always_busy_tries_five_times() {
        let mut builds = 0u32;
        let mut sleeps = Vec::new();
        let result: Result<&str, _> = create_with_retry(
            || {
                builds += 1;
                Err("HRESULT 0x800700AA".into())
            },
            |ms| sleeps.push(ms),
            |_attempt, _code, _raw| {},
        );
        assert_eq!(result.unwrap_err().0, WebviewCreateFailure::Retry);
        assert_eq!(builds, 5);
        assert_eq!(sleeps, vec![1_000, 1_000, 1_000, 2_000]);
    }

    #[test]
    fn fatal_hresult_does_not_retry_the_create() {
        let mut builds = 0u32;
        let mut sleeps = Vec::new();
        let result: Result<&str, _> = create_with_retry(
            || {
                builds += 1;
                Err("HRESULT 0x80004005".into())
            },
            |ms| sleeps.push(ms),
            |_attempt, _code, _raw| {},
        );
        assert_eq!(result.unwrap_err().0, WebviewCreateFailure::Fatal);
        assert_eq!(builds, 1);
        assert!(sleeps.is_empty());
    }

    #[test]
    fn error_without_hresult_is_fatal() {
        let mut sleeps = Vec::new();
        let result: Result<&str, _> = create_with_retry(
            || Err("webview create failed".into()),
            |ms| sleeps.push(ms),
            |_attempt, _code, _raw| {},
        );
        assert_eq!(result.unwrap_err().0, WebviewCreateFailure::Fatal);
        assert!(sleeps.is_empty());
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
