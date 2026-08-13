mod companion;
mod db;
mod icons;
mod installed_apps;
mod input;
mod macros;
mod music;
mod prediction;
mod profiles;
mod services;
mod stt;
mod tts;
mod window;

#[cfg(not(target_os = "windows"))]
compile_error!("ReachPanel is Windows-only. macOS is not supported.");

use db::{
    Database, MacroDef, MacroStep, Phrase, Profile, QuickAction,
};
use input::{
    begin_trackpad_gesture, end_trackpad_gesture, get_cursor_position, get_input_methods,
    get_keyboard_layout, get_keyboard_state, get_layout_key_labels, mouse_click,
    mouse_double_click, mouse_scroll, move_cursor_absolute, move_cursor_relative, press_combo,
    press_key, press_media_key, set_input_method_by_hkl, set_input_method_by_language,
    set_system_language, type_text, windows_ui_language, InputMethod, KeyPressRequest,
    KeyboardState, LayoutKeyLabel,
};
use input::focus_target;
use prediction::{
    ensure_english_pack, get_installed_languages, get_suggestions, install_word_pack,
    list_word_packs, record_usage, uninstall_word_pack, WordPackInfo,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use stt::{get_status as get_stt_status, start_dictation, stop_dictation, SttStatus};
use tts::{get_tts_status, list_voices, speak_text, stop_speaking, validate_tts, TtsSettings};
use profiles::{ProfileFileInfo, ProfileStore, INTERNAL_PROFILE_ID};
use window::{compute_window_layout, list_monitors, MonitorInfo, WindowLayout};

pub(crate) struct AppState {
    pub(crate) db: Database,
    profiles: ProfileStore,
    last_error: Mutex<Option<String>>,
}

#[derive(Debug, Serialize)]
struct CommandResult {
    success: bool,
    error: Option<String>,
}

fn ok() -> CommandResult {
    CommandResult { success: true, error: None }
}

fn err(e: impl ToString) -> CommandResult {
    CommandResult {
        success: false,
        error: Some(e.to_string()),
    }
}

fn set_error(state: &State<AppState>, message: Option<String>) {
    if let Ok(mut guard) = state.last_error.lock() {
        *guard = message;
    }
}

#[tauri::command]
fn get_last_error(state: State<AppState>) -> Option<String> {
    state.last_error.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
fn cmd_press_key(request: KeyPressRequest, state: State<AppState>) -> CommandResult {
    match press_key(request) {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_type_text(text: String, state: State<AppState>) -> CommandResult {
    match type_text(&text) {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_press_combo(keys: Vec<String>, state: State<AppState>) -> CommandResult {
    match press_combo(keys) {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_press_media_key(key: String, state: State<AppState>) -> CommandResult {
    match press_media_key(&key) {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
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
fn cmd_set_system_language(
    language: String,
    klid: Option<String>,
    state: State<AppState>,
) -> CommandResult {
    let result = match klid.as_deref() {
        Some(k) if !k.is_empty() => set_input_method_by_language(&language, Some(k)),
        _ => set_system_language(&language),
    };
    match result {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_get_input_methods() -> Vec<InputMethod> {
    get_input_methods()
}

#[tauri::command]
fn cmd_set_input_method(hkl: u64, state: State<AppState>) -> CommandResult {
    match set_input_method_by_hkl(hkl) {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_get_layout_key_labels(hkl: Option<u64>) -> Vec<LayoutKeyLabel> {
    get_layout_key_labels(hkl)
}

#[tauri::command]
fn cmd_move_cursor_relative(dx: i32, dy: i32, state: State<AppState>) -> CommandResult {
    match move_cursor_relative(dx, dy) {
        Ok(()) => ok(),
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_trackpad_gesture_begin(
    window: tauri::WebviewWindow,
    state: State<AppState>,
) -> CommandResult {
    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd.0 as isize,
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            return err(e);
        }
    };
    match begin_trackpad_gesture(hwnd) {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_trackpad_gesture_end(state: State<AppState>) -> CommandResult {
    match end_trackpad_gesture() {
        Ok(()) => {
            set_error(&state, None);
            ok()
        }
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_move_cursor_absolute(x: i32, y: i32, state: State<AppState>) -> CommandResult {
    match move_cursor_absolute(x, y) {
        Ok(()) => ok(),
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_get_cursor_position() -> Result<(i32, i32), String> {
    get_cursor_position().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_mouse_click(button: String, state: State<AppState>) -> CommandResult {
    match mouse_click(&button) {
        Ok(()) => ok(),
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_mouse_double_click(state: State<AppState>) -> CommandResult {
    match mouse_double_click() {
        Ok(()) => ok(),
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[tauri::command]
fn cmd_mouse_scroll(delta: i32, horizontal: bool, state: State<AppState>) -> CommandResult {
    match mouse_scroll(delta, horizontal) {
        Ok(()) => ok(),
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
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
    mini_mode: bool,
    mini_keyboard_visible: bool,
    mini_keyboard_height_ratio: f32,
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
        mini_mode,
        mini_keyboard_visible,
        mini_keyboard_height_ratio,
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

async fn set_window_layout(
    app: &tauri::AppHandle,
    layout: WindowLayout,
) -> Result<(), String> {
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
    mini_mode: bool,
    mini_keyboard_visible: bool,
    mini_keyboard_height_ratio: f32,
    full_work_area: bool,
) -> Result<(), String> {
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
        mini_mode,
        mini_keyboard_visible,
        mini_keyboard_height_ratio,
        dpi_scale,
        full_work_area,
    )?;
    let from = get_current_window_layout(&window)?;

    let animation_ms = if mini_mode {
        window::MINI_MODE_ANIMATION_MS
    } else {
        window::COLLAPSE_ANIMATION_MS
    };
    let steps = animation_ms / window::COLLAPSE_ANIMATION_FRAME_MS;
    for step in 0..=steps {
        let progress = step as f32 / steps as f32;
        let layout = window::interpolate_layout(from, target, progress);
        set_window_layout(app, layout).await?;
        if step < steps {
            tokio::time::sleep(std::time::Duration::from_millis(
                window::COLLAPSE_ANIMATION_FRAME_MS,
            ))
            .await;
        }
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
    mini_mode: Option<bool>,
    mini_keyboard_visible: Option<bool>,
    mini_keyboard_height_ratio: Option<f32>,
    full_work_area: Option<bool>,
) -> Result<(), String> {
    apply_window_layout(
        &app,
        monitor_id,
        collapsed,
        collapsed_dictation,
        collapsed_settings.unwrap_or(false),
        height_ratio,
        mini_mode.unwrap_or(false),
        mini_keyboard_visible.unwrap_or(false),
        mini_keyboard_height_ratio.unwrap_or(window::MINI_KEYBOARD_HEIGHT_RATIO),
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
    mini_mode: Option<bool>,
    mini_keyboard_visible: Option<bool>,
    mini_keyboard_height_ratio: Option<f32>,
    full_work_area: Option<bool>,
) -> Result<(), String> {
    animate_window_layout(
        &app,
        monitor_id,
        collapsed,
        collapsed_dictation,
        collapsed_settings.unwrap_or(false),
        height_ratio,
        mini_mode.unwrap_or(false),
        mini_keyboard_visible.unwrap_or(false),
        mini_keyboard_height_ratio.unwrap_or(window::MINI_KEYBOARD_HEIGHT_RATIO),
        full_work_area.unwrap_or(false),
    )
    .await
}

#[tauri::command]
async fn cmd_move_window_to_monitor(
    app: tauri::AppHandle,
    monitor_id: u32,
    height_ratio: f32,
) -> Result<(), String> {
    apply_window_layout(
        &app,
        monitor_id,
        false,
        false,
        false,
        height_ratio,
        false,
        false,
        window::MINI_KEYBOARD_HEIGHT_RATIO,
        false,
    )
    .await
}

#[tauri::command]
async fn cmd_set_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
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
async fn cmd_set_collapsed(
    app: tauri::AppHandle,
    monitor_id: u32,
    collapsed: bool,
    collapsed_dictation: bool,
    height_ratio: f32,
) -> Result<(), String> {
    apply_window_layout(
        &app,
        monitor_id,
        collapsed,
        collapsed_dictation,
        false,
        height_ratio,
        false,
        false,
        window::MINI_KEYBOARD_HEIGHT_RATIO,
        false,
    )
    .await
}

#[tauri::command]
fn cmd_get_profiles(state: State<AppState>) -> Result<Vec<Profile>, String> {
    state.db.get_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_list_profile_files(state: State<AppState>) -> Result<Vec<ProfileFileInfo>, String> {
    state.profiles.list_profile_files().map_err(|e| e.to_string())
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

    window
        .set_always_on_top(false)
        .map_err(|e| e.to_string())?;
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

    window
        .set_always_on_top(false)
        .map_err(|e| e.to_string())?;
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
async fn cmd_list_installed_apps() -> Result<Vec<installed_apps::InstalledApp>, String> {
    tokio::task::spawn_blocking(installed_apps::list_installed_apps)
        .await
        .map_err(|e| e.to_string())?
}

fn pick_app_executable(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("settings")
        .or_else(|| app.get_webview_window("main"))
        .ok_or_else(|| "No window found".to_string())?;

    let _ = window.set_always_on_top(false);
    let _restore = RestoreAlwaysOnTop(app.clone());

    let file = rfd::FileDialog::new()
        .add_filter("Programs", &["exe"])
        .set_title("Select application")
        .set_parent(&window)
        .pick_file();

    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn cmd_pick_app_executable(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_app_executable(&app))
        .await
        .map_err(|e| e.to_string())?
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

#[tauri::command]
fn cmd_get_quick_actions(profile_id: String, state: State<AppState>) -> Result<Vec<QuickAction>, String> {
    state.db.get_quick_actions(&profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_save_quick_action(action: QuickAction, state: State<AppState>) -> Result<(), String> {
    state.db.save_quick_action(&action).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_quick_action(id: String, state: State<AppState>) -> Result<(), String> {
    state.db.delete_quick_action(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_launch_quick_action(
    app: tauri::AppHandle,
    action_type: String,
    target: String,
) -> Result<(), String> {
    services::launch_quick_action(&app, &action_type, &target)
}

/// Returns a cached PNG path for an installed app icon (for `convertFileSrc`), or null.
#[tauri::command]
fn cmd_get_app_icon(app: tauri::AppHandle, target: String) -> Option<String> {
    icons::app_icon_cached_path(&app, &target)
}

#[tauri::command]
fn cmd_is_app_installed(target: String) -> bool {
    icons::is_app_installed(&target)
}

#[tauri::command]
fn cmd_get_phrases(
    profile_id: String,
    language: String,
    state: State<AppState>,
) -> Result<Vec<Phrase>, String> {
    state
        .db
        .get_phrases(&profile_id, &language)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_phrase_categories(profile_id: String, state: State<AppState>) -> Result<Vec<db::PhraseCategory>, String> {
    state.db.get_phrase_categories(&profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_use_phrase(
    text: String,
    action: String,
    language: String,
    app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let skip_host_tts = companion_tablet_audio_active(&app);
    tokio::task::spawn_blocking(move || {
        if action == "type" || action == "both" {
            type_text(&text).map_err(|e| e.to_string())?;
        }
        // While companion owns audio, Speak runs on the tablet — skip host TTS.
        if !skip_host_tts && (action == "speak" || action == "both") {
            speak_text(
                &text,
                TtsSettings {
                    rate: 0,
                    volume: 100,
                    language,
                },
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_speak(
    text: String,
    rate: i32,
    volume: u16,
    language: String,
    app: AppHandle,
) -> Result<(), String> {
    if companion_tablet_audio_active(&app) {
        return Ok(());
    }
    tokio::task::spawn_blocking(move || {
        speak_text(
            &text,
            TtsSettings {
                rate,
                volume,
                language,
            },
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn companion_tablet_audio_active(app: &AppHandle) -> bool {
    app.try_state::<companion::CompanionBridge>()
        .map(|bridge| bridge.session().tablet_audio_active())
        .unwrap_or(false)
}

#[tauri::command]
async fn cmd_stop_speaking() -> Result<(), String> {
    tokio::task::spawn_blocking(|| stop_speaking().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_list_voices() -> Result<Vec<String>, String> {
    list_voices().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_tts_status() -> Result<String, String> {
    get_tts_status().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_validate_tts() -> Result<(), String> {
    validate_tts().map_err(|e| e.to_string())
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
    Ok(get_stt_status(
        language.as_deref(),
        groq_api_key.as_deref(),
    ))
}

/// Strict allowlist of Windows Settings pages this app may open.
const ALLOWED_MS_SETTINGS_PAGES: &[&str] = &[
    "ms-settings:privacy-speech",
    "ms-settings:speech",
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
fn cmd_record_word(profile_id: String, word: String, language: String, state: State<AppState>) -> Result<(), String> {
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

#[tauri::command]
fn cmd_get_languages() -> Vec<String> {
    get_installed_languages()
}

#[tauri::command]
fn cmd_get_macros(profile_id: String, state: State<AppState>) -> Result<Vec<MacroDef>, String> {
    state.db.get_macros(&profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_macro_steps(macro_id: String, state: State<AppState>) -> Result<Vec<MacroStep>, String> {
    state.db.get_macro_steps(&macro_id).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
struct SaveMacroPayload {
    macro_def: MacroDef,
    steps: Vec<MacroStep>,
}

#[tauri::command]
fn cmd_save_macro(payload: SaveMacroPayload, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .save_macro(&payload.macro_def, &payload.steps)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_macro(id: String, state: State<AppState>) -> Result<(), String> {
    state.db.delete_macro(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_run_macro(macro_id: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    macros::run_macro(&app, &state.db, &macro_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_export_macro(macro_id: String, state: State<AppState>) -> Result<String, String> {
    macros::export_macro(&state.db, &macro_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_import_macro(json: String, state: State<AppState>) -> Result<MacroDef, String> {
    let macro_def = macros::import_macro(&state.db, &json).map_err(|e| e.to_string())?;
    state
        .profiles
        .save_active_profile(&state.db)
        .map_err(|e| e.to_string())?;
    Ok(macro_def)
}

#[tauri::command]
fn cmd_get_head_tracking_settings(profile_id: String, state: State<AppState>) -> Result<String, String> {
    state.db.get_head_tracking_settings(&profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_save_head_tracking_settings(profile_id: String, settings_json: String, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .save_head_tracking_settings(&profile_id, &settings_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_head_tracking_move(dx: i32, dy: i32, state: State<AppState>) -> CommandResult {
    match move_cursor_relative(dx, dy) {
        Ok(()) => ok(),
        Err(e) => {
            set_error(&state, Some(e.to_string()));
            err(e)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
                last_error: Mutex::new(None),
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
                focus_target::init(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_last_error,
            cmd_press_key,
            cmd_type_text,
            cmd_press_combo,
            cmd_press_media_key,
            cmd_get_keyboard_layout,
            cmd_get_keyboard_state,
            cmd_set_system_language,
            cmd_get_input_methods,
            cmd_set_input_method,
            cmd_get_layout_key_labels,
            cmd_move_cursor_relative,
            cmd_trackpad_gesture_begin,
            cmd_trackpad_gesture_end,
            cmd_move_cursor_absolute,
            cmd_get_cursor_position,
            cmd_mouse_click,
            cmd_mouse_double_click,
            cmd_mouse_scroll,
            cmd_list_monitors,
            cmd_get_main_window_monitor,
            cmd_apply_window_layout,
            cmd_animate_window_layout,
            cmd_move_window_to_monitor,
            cmd_set_always_on_top,
            cmd_set_window_focusable,
            cmd_set_collapsed,
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
            cmd_list_installed_apps,
            cmd_pick_app_executable,
            cmd_read_music_file,
            cmd_list_imported_songs,
            cmd_upsert_imported_song,
            cmd_delete_imported_song,
            cmd_update_profile_settings,
            cmd_get_quick_actions,
            cmd_save_quick_action,
            cmd_delete_quick_action,
            cmd_launch_quick_action,
            cmd_get_app_icon,
            cmd_is_app_installed,
            cmd_get_phrases,
            cmd_get_phrase_categories,
            cmd_use_phrase,
            cmd_speak,
            cmd_stop_speaking,
            cmd_list_voices,
            cmd_get_tts_status,
            cmd_validate_tts,
            cmd_start_dictation,
            cmd_stop_dictation,
            cmd_get_stt_status,
            cmd_open_windows_settings,
            cmd_get_suggestions,
            cmd_record_word,
            cmd_list_word_packs,
            cmd_install_word_pack,
            cmd_uninstall_word_pack,
            cmd_get_languages,
            cmd_get_macros,
            cmd_get_macro_steps,
            cmd_save_macro,
            cmd_delete_macro,
            cmd_run_macro,
            cmd_export_macro,
            cmd_import_macro,
            cmd_get_head_tracking_settings,
            cmd_save_head_tracking_settings,
            cmd_head_tracking_move,
            companion::cmd_companion_start,
            companion::cmd_companion_stop,
            companion::cmd_companion_status,
            companion::cmd_companion_pairing_payload,
            companion::cmd_companion_refresh_pairing,
            companion::cmd_companion_list_devices,
            companion::cmd_companion_revoke_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
