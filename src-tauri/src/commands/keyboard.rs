use crate::commands::{err, ok, CommandResult};
use crate::input::focus_target;
use crate::input::{
    get_input_methods, get_keyboard_layout, get_keyboard_state, get_layout_key_labels,
    launch_pc_mic_tap, pc_mic_config_from_settings, pc_mic_hold_down, pc_mic_hold_up, press_key,
    release_held_combo_keys, reset_layout_compose_state, set_input_method_by_hkl,
    set_input_method_by_language, set_system_language, translate_layout_key_press, type_text,
    windows_ui_language, InputMethod, KeyPressRequest, KeyboardState, LayoutKeyLabel,
    LayoutKeyTranslation, PcMicConfig,
};
use crate::profiles::INTERNAL_PROFILE_ID;
use crate::AppState;
use tauri::Manager;

fn active_pc_mic_config(app: &tauri::AppHandle) -> Result<PcMicConfig, String> {
    let state = app.state::<AppState>();
    let profile = state
        .db
        .get_profile_by_id(INTERNAL_PROFILE_ID)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Active profile missing".to_string())?;
    let settings: serde_json::Value =
        serde_json::from_str(&profile.settings_json).map_err(|e| e.to_string())?;
    Ok(pc_mic_config_from_settings(&settings))
}

fn companion_blocks_pc_mic(app: &tauri::AppHandle) -> bool {
    let tablet_audio = app
        .try_state::<crate::companion::CompanionBridge>()
        .is_some_and(|bridge| bridge.session().tablet_audio_active());
    tablet_audio || crate::companion::dictation_is_active()
}

#[tauri::command]
pub fn cmd_press_key(request: KeyPressRequest) -> CommandResult {
    match press_key(request) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_launch_windows_voice_typing(app: tauri::AppHandle) -> CommandResult {
    if companion_blocks_pc_mic(&app) {
        return err("Companion tablet is connected. Use the tablet mic for dictation.");
    }
    let config = match active_pc_mic_config(&app) {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    if config.hold {
        return err("This mic shortcut uses hold-to-talk. Press and hold the Mic button.");
    }
    match launch_pc_mic_tap(&config) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_pc_mic_hold_down(app: tauri::AppHandle) -> CommandResult {
    if companion_blocks_pc_mic(&app) {
        return err("Companion tablet is connected. Use the tablet mic for dictation.");
    }
    let config = match active_pc_mic_config(&app) {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    if !config.hold {
        return err("Mic shortcut is not in hold mode");
    }
    match pc_mic_hold_down(&config) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_pc_mic_hold_up(_app: tauri::AppHandle) -> CommandResult {
    match pc_mic_hold_up() {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_pc_mic_release_stuck_keys() -> CommandResult {
    match release_held_combo_keys() {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_type_text(text: String) -> CommandResult {
    match type_text(&text) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_get_keyboard_layout() -> String {
    get_keyboard_layout()
}

#[tauri::command]
pub fn cmd_get_keyboard_state() -> KeyboardState {
    get_keyboard_state()
}

#[tauri::command]
pub fn cmd_get_input_focused() -> bool {
    focus_target::is_input_focused()
}

#[tauri::command]
pub fn cmd_set_system_language(language: String, klid: Option<String>) -> CommandResult {
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
pub fn cmd_get_input_methods() -> Vec<InputMethod> {
    get_input_methods()
}

#[tauri::command]
pub fn cmd_set_input_method(hkl: u64) -> CommandResult {
    match set_input_method_by_hkl(hkl) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_get_layout_key_labels(hkl: Option<u64>) -> Vec<LayoutKeyLabel> {
    get_layout_key_labels(hkl)
}

#[tauri::command]
pub fn cmd_translate_layout_key(
    physical_key: String,
    shift: bool,
    caps_lock: bool,
    hkl: Option<u64>,
) -> LayoutKeyTranslation {
    translate_layout_key_press(&physical_key, shift, caps_lock, hkl)
}

#[tauri::command]
pub fn cmd_reset_layout_compose_state(hkl: Option<u64>) {
    reset_layout_compose_state(hkl);
}

#[tauri::command]
pub fn cmd_get_windows_ui_language() -> String {
    windows_ui_language()
}
