mod db;
mod input;
mod macros;
mod prediction;
mod profiles;
mod tts;
mod window;

use db::{
    Database, MacroDef, MacroStep, Phrase, Profile, QuickAction,
};
use input::{
    focus_target, get_keyboard_layout, get_keyboard_state, get_cursor_position, mouse_click,
    mouse_double_click, mouse_scroll, move_cursor_absolute, move_cursor_relative, press_combo,
    press_key, press_media_key, set_system_language, type_text, KeyPressRequest, KeyboardState,
};
use prediction::{get_installed_languages, get_suggestions, record_usage};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;
use tts::{list_voices, speak_text, stop_speaking, TtsSettings};
use profiles::{pick_image_file, ProfileFileInfo, ProfileStore, INTERNAL_PROFILE_ID};
use window::{list_monitors, MonitorInfo};

struct AppState {
    db: Database,
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
fn cmd_set_system_language(language: String, state: State<AppState>) -> CommandResult {
    match set_system_language(&language) {
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

#[tauri::command]
async fn cmd_move_window_to_monitor(
    app: tauri::AppHandle,
    monitor_id: u32,
) -> Result<(), String> {
    let monitors = list_monitors();
    let monitor = monitors
        .into_iter()
        .find(|m| m.id == monitor_id)
        .ok_or_else(|| "Monitor not found".to_string())?;
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: monitor.x,
                y: monitor.y,
            }))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: monitor.width as u32,
                height: monitor.height as u32,
            }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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
async fn cmd_set_collapsed(app: tauri::AppHandle, collapsed: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if collapsed {
            window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: 800,
                    height: 48,
                }))
                .map_err(|e| e.to_string())?;
        } else {
            window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: 1200,
                    height: 700,
                }))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
fn cmd_pick_background_image() -> Result<Option<String>, String> {
    pick_image_file().map_err(|e| e.to_string())
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
    match action_type.as_str() {
        "url" => app.opener().open_url(&target, None::<&str>).map_err(|e| e.to_string())?,
        "app" => {
            let path = if target.contains('\\') || target.contains('/') {
                target
            } else {
                format!("{target}.exe")
            };
            app.opener().open_path(&path, None::<&str>).map_err(|e| e.to_string())?;
        }
        _ => return Err("Unknown action type".to_string()),
    }
    Ok(())
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
fn cmd_use_phrase(
    text: String,
    action: String,
    language: String,
    _state: State<AppState>,
) -> Result<(), String> {
    if action == "type" || action == "both" {
        type_text(&text).map_err(|e| e.to_string())?;
    }
    if action == "speak" || action == "both" {
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
}

#[tauri::command]
fn cmd_speak(text: String, rate: i32, volume: u16, language: String) -> Result<(), String> {
    speak_text(
        &text,
        TtsSettings {
            rate,
            volume,
            language,
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_stop_speaking() -> Result<(), String> {
    stop_speaking().map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_list_voices() -> Result<Vec<String>, String> {
    list_voices().map_err(|e| e.to_string())
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
    record_usage(&state.db, &profile_id, &word, &language).map_err(|e| e.to_string())
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
    macros::import_macro(&state.db, &json).map_err(|e| e.to_string())
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

#[tauri::command]
fn cmd_validation_status() -> serde_json::Value {
    serde_json::json!({
        "apps": [
            { "name": "Notepad", "type": true, "combos": true, "special": true },
            { "name": "Chrome", "type": true, "combos": true, "special": true },
            { "name": "Word", "type": true, "combos": true, "special": true },
            { "name": "Teams", "type": true, "combos": true, "special": true },
            { "name": "Explorer", "type": true, "combos": true, "special": true }
        ],
        "limitations": [
            "Elevated/admin applications may block input injection",
            "UAC prompts require physical confirmation"
        ]
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let db = Database::new(app_data_dir.clone()).expect("failed to initialize database");
            let profiles =
                ProfileStore::new(&app_data_dir).expect("failed to initialize profile store");
            profiles
                .ensure_default_profile_file(&db)
                .expect("failed to load default profile file");
            app.manage(AppState {
                db,
                profiles,
                last_error: Mutex::new(None),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                let _ = window.set_focusable(false);
                focus_target::init();
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
            cmd_move_cursor_relative,
            cmd_move_cursor_absolute,
            cmd_get_cursor_position,
            cmd_mouse_click,
            cmd_mouse_double_click,
            cmd_mouse_scroll,
            cmd_list_monitors,
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
            cmd_pick_background_image,
            cmd_update_profile_settings,
            cmd_get_quick_actions,
            cmd_save_quick_action,
            cmd_delete_quick_action,
            cmd_launch_quick_action,
            cmd_get_phrases,
            cmd_get_phrase_categories,
            cmd_use_phrase,
            cmd_speak,
            cmd_stop_speaking,
            cmd_list_voices,
            cmd_get_suggestions,
            cmd_record_word,
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
            cmd_validation_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
