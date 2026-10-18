use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

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
