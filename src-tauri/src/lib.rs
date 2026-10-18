mod companion;
mod db;
mod input;
mod language;
mod music;
mod prediction;
mod profiles;
mod services;
mod stt;
mod teaching_pdf;
mod teaching_pdf_appearances;
mod teaching_pdf_reach;
mod window;

#[cfg(not(target_os = "windows"))]
compile_error!("ReachPanel is Windows-only. macOS is not supported.");

use db::{Database, Profile};
use input::focus_target;
use input::{
    begin_trackpad_gesture, end_trackpad_gesture, get_cursor_position, get_input_methods,
    get_keyboard_layout, get_keyboard_state, get_layout_key_labels, mouse_click,
    mouse_double_click, mouse_scroll, move_cursor_relative, press_key,
    primary_mouse_button_down, reset_layout_compose_state, set_input_method_by_hkl,
    set_input_method_by_language, set_system_language, translate_layout_key_press, type_text,
    windows_ui_language, InputMethod, KeyPressRequest, KeyboardState, LayoutKeyLabel,
    LayoutKeyTranslation,
};
use prediction::{
    ensure_english_pack, get_suggestions, install_word_pack, list_word_packs, record_usage,
    uninstall_word_pack, WordPackInfo,
};
use profiles::{ProfileFileInfo, ProfileStore, INTERNAL_PROFILE_ID};
use serde::Serialize;
use stt::{get_status as get_stt_status, start_dictation, stop_dictation, SttStatus};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use window::{
    apply_taskbar_position_from_str, compute_window_layout, get_taskbar_position_for_monitor,
    list_monitors, MonitorInfo, TaskbarPosition, TaskbarPositionResult, WindowLayout,
};

pub(crate) struct AppState {
    pub(crate) db: Database,
    pub(crate) profiles: ProfileStore,
}

#[derive(Debug, Serialize)]
struct CommandResult {
    success: bool,
    error: Option<String>,
}

fn ok() -> CommandResult {
    CommandResult {
        success: true,
        error: None,
    }
}

fn err(e: impl ToString) -> CommandResult {
    CommandResult {
        success: false,
        error: Some(e.to_string()),
    }
}

#[tauri::command]
fn cmd_press_key(request: KeyPressRequest) -> CommandResult {
    match press_key(request) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_type_text(text: String) -> CommandResult {
    match type_text(&text) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_get_keyboard_layout() -> String {
    get_keyboard_layout()
}

#[tauri::command]
fn cmd_get_keyboard_state() -> KeyboardState {
    get_keyboard_state()
}

#[tauri::command]
fn cmd_set_input_preview_enabled(enabled: bool) {
    input::input_preview::set_enabled(enabled);
}

#[tauri::command]
fn cmd_get_input_focused() -> bool {
    focus_target::is_input_focused()
}

#[tauri::command]
fn cmd_set_system_language(language: String, klid: Option<String>) -> CommandResult {
    let result = match klid.as_deref() {
        Some(k) if !k.is_empty() => set_input_method_by_language(&language, Some(k)),
        _ => set_system_language(&language),
    };
    match result {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_get_input_methods() -> Vec<InputMethod> {
    get_input_methods()
}

#[tauri::command]
fn cmd_set_input_method(hkl: u64) -> CommandResult {
    match set_input_method_by_hkl(hkl) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_get_layout_key_labels(hkl: Option<u64>) -> Vec<LayoutKeyLabel> {
    get_layout_key_labels(hkl)
}

#[tauri::command]
fn cmd_translate_layout_key(
    physical_key: String,
    shift: bool,
    caps_lock: bool,
    hkl: Option<u64>,
) -> LayoutKeyTranslation {
    translate_layout_key_press(&physical_key, shift, caps_lock, hkl)
}

#[tauri::command]
fn cmd_reset_layout_compose_state(hkl: Option<u64>) {
    reset_layout_compose_state(hkl);
}

#[tauri::command]
fn cmd_move_cursor_relative(dx: i32, dy: i32) -> CommandResult {
    match move_cursor_relative(dx, dy) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_trackpad_gesture_begin(window: tauri::WebviewWindow) -> CommandResult {
    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd.0 as isize,
        Err(e) => return err(e),
    };
    match begin_trackpad_gesture(hwnd) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_trackpad_gesture_end() -> CommandResult {
    match end_trackpad_gesture() {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_get_cursor_position() -> Result<(i32, i32), String> {
    get_cursor_position().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_primary_mouse_button_down() -> bool {
    primary_mouse_button_down()
}

#[tauri::command]
fn cmd_mouse_click(button: String) -> CommandResult {
    match mouse_click(&button) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_mouse_double_click() -> CommandResult {
    match mouse_double_click() {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_mouse_scroll(delta: i32, horizontal: bool) -> CommandResult {
    match mouse_scroll(delta, horizontal) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
fn cmd_list_monitors() -> Vec<MonitorInfo> {
    list_monitors()
}

/// Returns the monitor id that contains the largest portion of the main window.
#[tauri::command]
async fn cmd_get_main_window_monitor(app: tauri::AppHandle) -> Result<u32, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let layout = get_current_window_layout(&window)?;
    let monitors = list_monitors();
    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }
    Ok(window::monitor_for_rect(
        &monitors,
        layout.x,
        layout.y,
        layout.width as i32,
        layout.height as i32,
    ))
}

async fn apply_window_layout(
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

fn main_window_dpi_scale(app: &AppHandle) -> f32 {
    app.get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .map(|s| s as f32)
        .unwrap_or(1.0)
}

fn get_current_window_layout(window: &tauri::WebviewWindow) -> Result<WindowLayout, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    window::get_window_bounds(hwnd.0 as isize)
}

async fn set_window_layout(app: &tauri::AppHandle, layout: WindowLayout) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        window::set_window_bounds(hwnd.0 as isize, layout)?;
    }
    Ok(())
}

async fn animate_window_layout(
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
            input::input_preview::end_animation_pause();
        }
    }
    input::input_preview::begin_animation_pause();
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
        window::FOCUS_MODE_ANIMATION_MS
    } else {
        window::COLLAPSE_ANIMATION_MS
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
        let layout = window::interpolate_layout(from, target, progress);
        set_window_layout(app, layout).await?;
        if progress >= 1.0 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(
            window::WINDOW_ANIMATION_FRAME_MS,
        ))
        .await;
    }
    Ok(())
}

#[tauri::command]
async fn cmd_apply_window_layout(
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
        focus_keyboard_height_ratio.unwrap_or(window::FOCUS_KEYBOARD_HEIGHT_RATIO),
        full_work_area.unwrap_or(false),
    )
    .await
}

#[tauri::command]
async fn cmd_animate_window_layout(
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
        focus_keyboard_height_ratio.unwrap_or(window::FOCUS_KEYBOARD_HEIGHT_RATIO),
        full_work_area.unwrap_or(false),
    )
    .await
}

#[tauri::command]
fn cmd_exclude_window_from_capture(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app.get_webview_window(&label).ok_or("window not found")?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    input::input_preview::exclude_window_from_capture(hwnd.0 as isize)
}

#[tauri::command]
async fn cmd_set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn cmd_set_window_focusable(app: tauri::AppHandle, focusable: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_focusable(focusable).map_err(|e| e.to_string())?;
        if !focusable {
            focus_target::remember_current_if_external();
        }
    }
    Ok(())
}

#[tauri::command]
async fn cmd_expand_window_for_mode_menu(
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
        window::mode_menu_layout(current, menu_width, menu_height, dpi_scale),
    )
    .await
}

#[tauri::command]
fn cmd_get_profiles(state: State<AppState>) -> Result<Vec<Profile>, String> {
    state.db.get_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_list_profile_files(state: State<AppState>) -> Result<Vec<ProfileFileInfo>, String> {
    state
        .profiles
        .list_profile_files()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_active_profile_file(state: State<AppState>) -> Result<String, String> {
    state.profiles.active_filename().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_load_profile_file(filename: String, state: State<AppState>) -> Result<(), String> {
    state
        .profiles
        .load_profile_file(&state.db, &filename)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_save_active_profile_file(state: State<AppState>) -> Result<(), String> {
    state
        .profiles
        .save_active_profile(&state.db)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_create_profile_file(
    filename: String,
    name: String,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .profiles
        .create_profile_file(&state.db, &filename, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_profile_file(filename: String, state: State<AppState>) -> Result<String, String> {
    state
        .profiles
        .delete_profile_file(&state.db, &filename)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_wipe_active_profile(state: State<AppState>) -> Result<(), String> {
    state
        .profiles
        .wipe_active_profile(&state.db)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_windows_ui_language() -> String {
    windows_ui_language()
}

/// Temporarily drops always-on-top so native file dialogs appear above the app window.
struct RestoreAlwaysOnTop(tauri::AppHandle);

impl Drop for RestoreAlwaysOnTop {
    fn drop(&mut self) {
        if let Some(window) = self.0.get_webview_window("main") {
            let _ = window.set_always_on_top(true);
        }
    }
}

fn pick_background_image(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    let _restore = RestoreAlwaysOnTop(app.clone());

    let file = rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"])
        .set_parent(&window)
        .pick_file();

    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn cmd_pick_background_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_background_image(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn pick_music_song_file(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    let _restore = RestoreAlwaysOnTop(app.clone());

    let file = rfd::FileDialog::new()
        .add_filter(
            "Music songs",
            &["json", "mid", "midi", "xml", "musicxml", "mxl"],
        )
        .add_filter("JSON", &["json"])
        .add_filter("MIDI", &["mid", "midi"])
        .add_filter("MusicXML", &["xml", "musicxml", "mxl"])
        .set_parent(&window)
        .pick_file();

    Ok(file.map(|p| {
        music::allow_music_read_path(&p);
        p.to_string_lossy().into_owned()
    }))
}

fn pick_teaching_pdf(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    let _restore = RestoreAlwaysOnTop(app.clone());

    let file = rfd::FileDialog::new()
        .add_filter("PDF", &["pdf"])
        .set_parent(&window)
        .pick_file();

    Ok(file.map(|p| {
        teaching_pdf::allow_teaching_pdf_read_path(app, &p);
        p.to_string_lossy().into_owned()
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MusicFilePayload {
    path: String,
    content_base64: String,
}

#[tauri::command]
async fn cmd_pick_music_song_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_music_song_file(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_pick_teaching_pdf(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_teaching_pdf(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn pick_teaching_reach_export_path(
    app: &tauri::AppHandle,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    let _restore = RestoreAlwaysOnTop(app.clone());

    let file = rfd::FileDialog::new()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&suggested_name)
        .set_parent(&window)
        .save_file();

    Ok(file.map(|p| {
        teaching_pdf::allow_teaching_pdf_read_path(app, &p);
        p.to_string_lossy().into_owned()
    }))
}

#[tauri::command]
async fn cmd_pick_teaching_reach_export_path(
    app: tauri::AppHandle,
    suggested_name: String,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_teaching_reach_export_path(&app, suggested_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_export_teaching_reach_pdf(
    app: tauri::AppHandle,
    source_path: String,
    from_page: u32,
    to_page: u32,
    dest_path: String,
) -> Result<teaching_pdf_reach::ReachExportResult, String> {
    teaching_pdf_reach::export_reach_pdf(&app, &source_path, from_page, to_page, &dest_path)
}

#[tauri::command]
fn cmd_read_teaching_pdf(
    app: tauri::AppHandle,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = teaching_pdf::read_teaching_pdf_bytes(&app, &path)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn cmd_list_teaching_pdfs(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Array(teaching_pdf::list_teaching_pdfs(
        &app,
    )?))
}

#[tauri::command]
fn cmd_save_teaching_pdfs(app: tauri::AppHandle, entries: serde_json::Value) -> Result<(), String> {
    let list = match entries {
        serde_json::Value::Array(items) => items,
        _ => return Err("Teaching PDF library must be a JSON array".to_string()),
    };
    teaching_pdf::save_teaching_pdfs(&app, list)
}

#[tauri::command]
fn cmd_ensure_teaching_reach_pdf(
    app: tauri::AppHandle,
    original_path: String,
) -> Result<teaching_pdf_reach::ReachPathResult, String> {
    teaching_pdf_reach::ensure_reach_pdf(&app, &original_path)
}

#[tauri::command]
fn cmd_read_teaching_reach_annotations(
    app: tauri::AppHandle,
    path: String,
) -> Result<teaching_pdf_reach::ReachAnnotationsResult, String> {
    teaching_pdf_reach::read_reach_annotations(&app, &path)
}

#[tauri::command]
fn cmd_write_teaching_reach_annotations(
    app: tauri::AppHandle,
    path: String,
    json: String,
) -> Result<teaching_pdf_reach::ReachPathResult, String> {
    teaching_pdf_reach::write_reach_annotations(&app, &path, &json)
}

#[tauri::command]
fn cmd_delete_teaching_reach_pdf(
    app: tauri::AppHandle,
    path: String,
) -> Result<teaching_pdf_reach::ReachDeleteResult, String> {
    teaching_pdf_reach::delete_reach_pdf(&app, &path)
}

#[tauri::command]
fn cmd_read_music_file(app: tauri::AppHandle, path: String) -> Result<MusicFilePayload, String> {
    let bytes = music::read_music_file_bytes(&app, &path)?;
    Ok(MusicFilePayload {
        path,
        content_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes),
    })
}

#[tauri::command]
fn cmd_list_imported_songs(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Array(music::list_imported_songs(&app)?))
}

#[tauri::command]
fn cmd_upsert_imported_song(
    app: tauri::AppHandle,
    song: serde_json::Value,
) -> Result<serde_json::Value, String> {
    music::upsert_imported_song(&app, song)
}

#[tauri::command]
fn cmd_delete_imported_song(app: tauri::AppHandle, id: String) -> Result<(), String> {
    music::delete_imported_song(&app, &id)
}

#[tauri::command]
fn cmd_list_custom_language_packs(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Array(
        language::list_custom_language_packs(&app)?,
    ))
}

#[tauri::command]
fn cmd_upsert_custom_language_pack(
    app: tauri::AppHandle,
    pack: serde_json::Value,
) -> Result<serde_json::Value, String> {
    language::upsert_custom_language_pack(&app, pack)
}

#[tauri::command]
fn cmd_delete_custom_language_pack(app: tauri::AppHandle, id: String) -> Result<(), String> {
    language::delete_custom_language_pack(&app, &id)
}

#[tauri::command]
fn cmd_update_profile_settings(
    profile_id: String,
    settings_json: String,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .db
        .update_profile_settings(&profile_id, &settings_json)
        .map_err(|e| e.to_string())?;
    if profile_id == INTERNAL_PROFILE_ID {
        state
            .profiles
            .save_active_profile(&state.db)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn companion_tablet_audio_active(app: &AppHandle) -> bool {
    app.try_state::<companion::CompanionBridge>()
        .map(|bridge| bridge.session().tablet_audio_active())
        .unwrap_or(false)
}

#[tauri::command]
async fn cmd_start_dictation(
    language: String,
    groq_api_key: Option<String>,
    app: AppHandle,
) -> Result<(), String> {
    if companion_tablet_audio_active(&app) || companion::dictation_is_active() {
        return Err(
            "Companion tablet is connected — use the tablet mic for dictation (PC mic disabled)."
                .to_string(),
        );
    }
    tokio::task::spawn_blocking(move || {
        start_dictation(&language, groq_api_key.as_deref(), app).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_stop_dictation() -> Result<(), String> {
    tokio::task::spawn_blocking(|| stop_dictation().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_get_stt_status(
    language: Option<String>,
    groq_api_key: Option<String>,
) -> Result<SttStatus, String> {
    Ok(get_stt_status(language.as_deref(), groq_api_key.as_deref()))
}

/// Applies a Windows taskbar edge preference on the monitor where ReachPanel runs.
#[tauri::command]
fn cmd_set_taskbar_position(
    position: String,
    monitor_id: Option<u32>,
) -> Result<TaskbarPositionResult, String> {
    apply_taskbar_position_from_str(&position, monitor_id)
}

/// Reads the taskbar edge on a specific monitor (defaults to primary).
#[tauri::command]
fn cmd_get_taskbar_position(monitor_id: Option<u32>) -> Option<TaskbarPosition> {
    let id = monitor_id.or_else(|| {
        list_monitors()
            .into_iter()
            .find(|m| m.is_primary)
            .map(|m| m.id)
    })?;
    get_taskbar_position_for_monitor(id)
}

/// Strict allowlist of Windows Settings pages this app may open.
const ALLOWED_MS_SETTINGS_PAGES: &[&str] = &[
    "ms-settings:privacy-speech",
    "ms-settings:speech",
    "ms-settings:taskbar",
];

/// Opens a Windows Settings page (e.g. `ms-settings:privacy-speech`).
#[tauri::command]
fn cmd_open_windows_settings(app: AppHandle, uri: String) -> Result<(), String> {
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
fn cmd_get_suggestions(
    profile_id: String,
    prefix: String,
    language: String,
    state: State<AppState>,
) -> Result<Vec<db::PredictionEntry>, String> {
    get_suggestions(&state.db, &profile_id, &prefix, &language, 5).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_record_word(
    profile_id: String,
    word: String,
    language: String,
    state: State<AppState>,
) -> Result<(), String> {
    record_usage(&state.db, &profile_id, &word, &language).map_err(|e| e.to_string())?;
    if profile_id == INTERNAL_PROFILE_ID {
        state
            .profiles
            .save_active_profile(&state.db)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn cmd_list_word_packs(state: State<AppState>) -> Result<Vec<WordPackInfo>, String> {
    list_word_packs(&state.db).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_install_word_pack(
    language: String,
    app: tauri::AppHandle,
) -> Result<Vec<WordPackInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let state = app.state::<AppState>();
        install_word_pack(&app, &state.db, &language).map_err(|e| e.to_string())?;
        list_word_packs(&state.db).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_uninstall_word_pack(
    language: String,
    state: State<AppState>,
) -> Result<Vec<WordPackInfo>, String> {
    uninstall_word_pack(&state.db, &language).map_err(|e| e.to_string())?;
    list_word_packs(&state.db).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
            let db = Database::new(app_data_dir.clone())
                .map_err(|e| format!("failed to initialize database: {e}"))?;
            let profiles = ProfileStore::new(&app_data_dir)
                .map_err(|e| format!("failed to initialize profile store: {e}"))?;
            profiles
                .ensure_default_profile_file(&db)
                .map_err(|e| format!("failed to load default profile file: {e}"))?;
            app.manage(AppState {
                db,
                profiles,
            });

            match companion::CompanionBridge::new(&app_data_dir) {
                Ok(bridge) => {
                    // Default off — user starts from Settings → Companion.
                    app.manage(bridge);
                }
                Err(e) => {
                    eprintln!("Failed to initialize companion bridge: {e}");
                    return Err(e.into());
                }
            }

            {
                let state = app.state::<AppState>();
                if let Err(e) = ensure_english_pack(app.handle(), &state.db) {
                    eprintln!("Failed to install bundled English word pack: {e}");
                }
            }

            stt::init(&app_data_dir, app.handle().clone());

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(false);
                let _ = window.set_always_on_top(true);
                let _ = window.set_focusable(false);
                if let Ok(hwnd) = window.hwnd() {
                    if let Err(e) =
                        input::input_preview::exclude_window_from_capture(hwnd.0 as isize)
                    {
                        eprintln!("Failed to exclude main window from capture: {e}");
                    }
                }
                focus_target::init(app.handle().clone());
                input::input_preview::init(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_press_key,
            cmd_type_text,
            cmd_get_keyboard_layout,
            cmd_get_keyboard_state,
            cmd_set_input_preview_enabled,
            cmd_get_input_focused,
            cmd_set_system_language,
            cmd_get_input_methods,
            cmd_set_input_method,
            cmd_get_layout_key_labels,
            cmd_translate_layout_key,
            cmd_reset_layout_compose_state,
            cmd_move_cursor_relative,
            cmd_trackpad_gesture_begin,
            cmd_trackpad_gesture_end,
            cmd_get_cursor_position,
            cmd_primary_mouse_button_down,
            cmd_mouse_click,
            cmd_mouse_double_click,
            cmd_mouse_scroll,
            cmd_list_monitors,
            cmd_get_main_window_monitor,
            cmd_apply_window_layout,
            cmd_animate_window_layout,
            cmd_set_always_on_top,
            cmd_exclude_window_from_capture,
            cmd_set_window_focusable,
            cmd_expand_window_for_mode_menu,
            cmd_get_profiles,
            cmd_list_profile_files,
            cmd_get_active_profile_file,
            cmd_load_profile_file,
            cmd_save_active_profile_file,
            cmd_create_profile_file,
            cmd_delete_profile_file,
            cmd_wipe_active_profile,
            cmd_get_windows_ui_language,
            cmd_pick_background_image,
            cmd_pick_music_song_file,
            cmd_pick_teaching_pdf,
            cmd_read_music_file,
            cmd_read_teaching_pdf,
            cmd_list_imported_songs,
            cmd_upsert_imported_song,
            cmd_delete_imported_song,
            cmd_list_teaching_pdfs,
            cmd_save_teaching_pdfs,
            cmd_ensure_teaching_reach_pdf,
            cmd_read_teaching_reach_annotations,
            cmd_write_teaching_reach_annotations,
            cmd_delete_teaching_reach_pdf,
            cmd_pick_teaching_reach_export_path,
            cmd_export_teaching_reach_pdf,
            cmd_list_custom_language_packs,
            cmd_upsert_custom_language_pack,
            cmd_delete_custom_language_pack,
            cmd_update_profile_settings,
            cmd_start_dictation,
            cmd_stop_dictation,
            cmd_get_stt_status,
            cmd_open_windows_settings,
            cmd_set_taskbar_position,
            cmd_get_taskbar_position,
            cmd_get_suggestions,
            cmd_record_word,
            cmd_list_word_packs,
            cmd_install_word_pack,
            cmd_uninstall_word_pack,
            companion::cmd_companion_start,
            companion::cmd_companion_stop,
            companion::cmd_companion_status,
            companion::cmd_companion_pairing_payload,
            companion::cmd_companion_refresh_pairing,
            companion::cmd_companion_list_devices,
            companion::cmd_companion_revoke_device,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            // Process entry: no caller to return to; exit instead of panicking.
            eprintln!("error while running tauri application: {e}");
            std::process::exit(1);
        });
}
