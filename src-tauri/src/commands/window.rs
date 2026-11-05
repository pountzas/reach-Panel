use crate::input::focus_target;
use crate::window::{
    apply_taskbar_position_from_str, get_taskbar_position_for_monitor, list_monitors,
    MonitorInfo, TaskbarPosition, TaskbarPositionResult,
};
use crate::window::layout::{
    animate_window_layout, apply_window_layout, get_current_window_layout, main_window_dpi_scale,
    set_window_layout,
};
use tauri::Manager;

#[tauri::command]
pub fn cmd_list_monitors() -> Vec<MonitorInfo> {
    list_monitors()
}

/// Returns the monitor id that contains the largest portion of the main window.
#[tauri::command]
pub async fn cmd_get_main_window_monitor(app: tauri::AppHandle) -> Result<u32, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let layout = get_current_window_layout(&window)?;
    let monitors = list_monitors();
    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }
    Ok(crate::window::monitor_for_rect(
        &monitors,
        layout.x,
        layout.y,
        layout.width as i32,
        layout.height as i32,
    ))
}

#[tauri::command]
pub async fn cmd_apply_window_layout(
    app: tauri::AppHandle,
    monitor_id: u32,
    collapsed: bool,
    collapsed_dictation: bool,
    height_ratio: f32,
    collapsed_settings: Option<bool>,
    focus_mode: Option<bool>,
    focus_keyboard_visible: Option<bool>,
    focus_keyboard_height_ratio: Option<f32>,
    full_work_area: Option<bool>,
) -> Result<(), String> {
    apply_window_layout(
        &app,
        monitor_id,
        collapsed,
        collapsed_dictation,
        collapsed_settings.unwrap_or(false),
        height_ratio,
        focus_mode.unwrap_or(false),
        focus_keyboard_visible.unwrap_or(false),
        focus_keyboard_height_ratio.unwrap_or(crate::window::FOCUS_KEYBOARD_HEIGHT_RATIO),
        full_work_area.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn cmd_animate_window_layout(
    app: tauri::AppHandle,
    monitor_id: u32,
    collapsed: bool,
    collapsed_dictation: bool,
    height_ratio: f32,
    collapsed_settings: Option<bool>,
    focus_mode: Option<bool>,
    focus_keyboard_visible: Option<bool>,
    focus_keyboard_height_ratio: Option<f32>,
    full_work_area: Option<bool>,
) -> Result<(), String> {
    animate_window_layout(
        &app,
        monitor_id,
        collapsed,
        collapsed_dictation,
        collapsed_settings.unwrap_or(false),
        height_ratio,
        focus_mode.unwrap_or(false),
        focus_keyboard_visible.unwrap_or(false),
        focus_keyboard_height_ratio.unwrap_or(crate::window::FOCUS_KEYBOARD_HEIGHT_RATIO),
        full_work_area.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn cmd_set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_set_window_focusable(app: tauri::AppHandle, focusable: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_focusable(focusable).map_err(|e| e.to_string())?;
        if !focusable {
            focus_target::remember_current_if_external();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_expand_window_for_mode_menu(
    app: tauri::AppHandle,
    menu_width: u32,
    menu_height: u32,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let current = get_current_window_layout(&window)?;
    let dpi_scale = main_window_dpi_scale(&app);
    set_window_layout(
        &app,
        crate::window::mode_menu_layout(current, menu_width, menu_height, dpi_scale),
    )
    .await
}

/// Applies a Windows taskbar edge preference on the monitor where ReachPanel runs.
#[tauri::command]
pub fn cmd_set_taskbar_position(
    position: String,
    monitor_id: Option<u32>,
) -> Result<TaskbarPositionResult, String> {
    apply_taskbar_position_from_str(&position, monitor_id)
}

/// Reads the taskbar edge on a specific monitor (defaults to primary).
#[tauri::command]
pub fn cmd_get_taskbar_position(monitor_id: Option<u32>) -> Option<TaskbarPosition> {
    let id = monitor_id.or_else(|| {
        list_monitors()
            .into_iter()
            .find(|m| m.is_primary)
            .map(|m| m.id)
    })?;
    get_taskbar_position_for_monitor(id)
}
