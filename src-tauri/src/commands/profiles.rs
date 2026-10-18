use crate::db::Profile;
use crate::profiles::{ProfileFileInfo, INTERNAL_PROFILE_ID};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn cmd_get_profiles(state: State<AppState>) -> Result<Vec<Profile>, String> {
    state.db.get_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_list_profile_files(state: State<AppState>) -> Result<Vec<ProfileFileInfo>, String> {
    state
        .profiles
        .list_profile_files()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_get_active_profile_file(state: State<AppState>) -> Result<String, String> {
    state.profiles.active_filename().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_load_profile_file(filename: String, state: State<AppState>) -> Result<(), String> {
    state
        .profiles
        .load_profile_file(&state.db, &filename)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_save_active_profile_file(state: State<AppState>) -> Result<(), String> {
    state
        .profiles
        .save_active_profile(&state.db)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_create_profile_file(
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
pub fn cmd_delete_profile_file(filename: String, state: State<AppState>) -> Result<String, String> {
    state
        .profiles
        .delete_profile_file(&state.db, &filename)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_wipe_active_profile(state: State<AppState>) -> Result<(), String> {
    state
        .profiles
        .wipe_active_profile(&state.db)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_update_profile_settings(
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
