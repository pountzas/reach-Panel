use std::fs;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Strict allowlist of Windows Settings pages this app may open.
const ALLOWED_MS_SETTINGS_PAGES: &[&str] = &[
    "ms-settings:privacy-speech",
    "ms-settings:speech",
    "ms-settings:taskbar",
];

/// Opens a Windows Settings page (e.g. `ms-settings:privacy-speech`).
#[tauri::command]
pub fn cmd_open_windows_settings(app: AppHandle, uri: String) -> Result<(), String> {
    let trimmed = uri.trim();
    if !ALLOWED_MS_SETTINGS_PAGES
        .iter()
        .any(|allowed| *allowed == trimmed)
    {
        return Err("Windows Settings page is not allowed".to_string());
    }
    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|e| format!("Failed to open Windows Settings: {e}"))
}

#[tauri::command]
pub fn cmd_get_log_dir() -> String {
    crate::diagnostics::logs_dir().display().to_string()
}

#[tauri::command]
pub fn cmd_open_log_dir() -> Result<(), String> {
    let dir = crate::diagnostics::logs_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs folder: {e}"))?;
    open_logs_in_explorer(&dir)
}

#[tauri::command]
pub async fn cmd_collect_diagnostics() -> String {
    let logs_dir = crate::diagnostics::logs_dir();
    let info = crate::diagnostics::DiagnosticsInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        windows_build: crate::logging::windows_build_number().to_string(),
        webview2: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        previous_session: crate::diagnostics::previous_session_status().into(),
    };
    crate::diagnostics::collect_diagnostics_report(&logs_dir, &info)
}

fn open_logs_in_explorer(dir: &Path) -> Result<(), String> {
    let explorer = std::env::var("WINDIR")
        .map(|windir| std::path::PathBuf::from(windir).join("explorer.exe"))
        .unwrap_or_else(|_| std::path::PathBuf::from(r"C:\Windows\explorer.exe"));
    Command::new(explorer)
        .arg(dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open logs folder: {e}"))?;
    Ok(())
}
