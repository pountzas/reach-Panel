use crate::commands::{err, ok, CommandResult};
use tauri::Manager;
use crate::input::focus_target;
use crate::input::{
    get_input_methods, get_keyboard_layout, get_keyboard_state, get_layout_key_labels,
    launch_windows_voice_typing, press_key,
    reset_layout_compose_state, set_input_method_by_hkl, set_input_method_by_language,
    set_system_language, translate_layout_key_press, type_text, windows_ui_language, InputMethod,
    KeyPressRequest, KeyboardState, LayoutKeyLabel, LayoutKeyTranslation,
};

#[tauri::command]
pub fn cmd_press_key(request: KeyPressRequest) -> CommandResult {
    match press_key(request) {
        Ok(()) => ok(),
        Err(e) => err(e),
    }
}

#[tauri::command]
pub fn cmd_launch_windows_voice_typing(app: tauri::AppHandle) -> CommandResult {
    let tablet_audio = app
        .try_state::<crate::companion::CompanionBridge>()
        .is_some_and(|bridge| bridge.session().tablet_audio_active());
    if tablet_audio || crate::companion::dictation_is_active() {
        return err("Companion tablet is connected. Use the tablet mic for dictation.");
    }
    match launch_windows_voice_typing() {
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
