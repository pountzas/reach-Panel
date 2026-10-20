use tauri::Manager;

#[tauri::command]
pub fn cmd_set_input_preview_enabled(enabled: bool) {
    crate::input::input_preview::set_enabled(enabled);
}

#[tauri::command]
pub fn cmd_exclude_window_from_capture(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app.get_webview_window(&label).ok_or("window not found")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    crate::input::input_preview::exclude_window_from_capture(hwnd.0 as isize)
}
