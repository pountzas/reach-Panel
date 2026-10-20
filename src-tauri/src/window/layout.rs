use super::{
    compute_window_layout, list_monitors, WindowLayout, COLLAPSE_ANIMATION_MS,
    FOCUS_MODE_ANIMATION_MS, WINDOW_ANIMATION_FRAME_MS,
};
use tauri::{AppHandle, Manager};

pub(crate) async fn apply_window_layout(
    app: &tauri::AppHandle,
    monitor_id: u32,
    collapsed: bool,
    collapsed_dictation: bool,
    collapsed_settings: bool,
    height_ratio: f32,
    focus_mode: bool,
    focus_keyboard_visible: bool,
    focus_keyboard_height_ratio: f32,
    full_work_area: bool,
) -> Result<(), String> {
    let monitors = list_monitors();
    let dpi_scale = main_window_dpi_scale(app);
    let layout = compute_window_layout(
        &monitors,
        monitor_id,
        collapsed,
        collapsed_dictation,
        collapsed_settings,
        height_ratio,
        focus_mode,
        focus_keyboard_visible,
        focus_keyboard_height_ratio,
        dpi_scale,
        full_work_area,
    )?;
    set_window_layout(app, layout).await
}

pub(crate) fn main_window_dpi_scale(app: &AppHandle) -> f32 {
    app.get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .map(|s| s as f32)
        .unwrap_or(1.0)
}

pub(crate) fn get_current_window_layout(
    window: &tauri::WebviewWindow,
) -> Result<WindowLayout, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    super::get_window_bounds(hwnd.0 as isize)
}

pub(crate) async fn set_window_layout(
    app: &tauri::AppHandle,
    layout: WindowLayout,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        super::set_window_bounds(hwnd.0 as isize, layout)?;
    }
    Ok(())
}

pub(crate) async fn animate_window_layout(
    app: &tauri::AppHandle,
    monitor_id: u32,
    collapsed: bool,
    collapsed_dictation: bool,
    collapsed_settings: bool,
    height_ratio: f32,
    focus_mode: bool,
    focus_keyboard_visible: bool,
    focus_keyboard_height_ratio: f32,
    full_work_area: bool,
) -> Result<(), String> {
    // Pause input-preview GDI capture for the whole animation (cleared on Drop; nested-safe).
    struct AnimationPreviewPause;
    impl Drop for AnimationPreviewPause {
        fn drop(&mut self) {
            crate::input::input_preview::end_animation_pause();
        }
    }
    crate::input::input_preview::begin_animation_pause();
    let _pause_preview = AnimationPreviewPause;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let monitors = list_monitors();
    let dpi_scale = main_window_dpi_scale(app);
    let target = compute_window_layout(
        &monitors,
        monitor_id,
        collapsed,
        collapsed_dictation,
        collapsed_settings,
        height_ratio,
        focus_mode,
        focus_keyboard_visible,
        focus_keyboard_height_ratio,
        dpi_scale,
        full_work_area,
    )?;
    let from = get_current_window_layout(&window)?;

    let animation_ms = if focus_mode {
        FOCUS_MODE_ANIMATION_MS
    } else {
        COLLAPSE_ANIMATION_MS
    };
    let duration = std::time::Duration::from_millis(animation_ms);
    let started = std::time::Instant::now();
    loop {
        let elapsed = started.elapsed();
        let progress = if duration.is_zero() {
            1.0
        } else {
            (elapsed.as_secs_f32() / duration.as_secs_f32()).clamp(0.0, 1.0)
        };
        let layout = super::interpolate_layout(from, target, progress);
        set_window_layout(app, layout).await?;
        if progress >= 1.0 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(WINDOW_ANIMATION_FRAME_MS)).await;
    }
    Ok(())
}
