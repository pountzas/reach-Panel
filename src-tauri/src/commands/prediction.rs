use crate::prediction::{
    get_suggestions, install_word_pack, list_word_packs, record_usage, uninstall_word_pack,
    WordPackInfo,
};
use crate::profiles::INTERNAL_PROFILE_ID;
use crate::AppState;
use tauri::{Manager, State};

#[tauri::command]
pub fn cmd_get_suggestions(
    profile_id: String,
    prefix: String,
    language: String,
    state: State<AppState>,
) -> Result<Vec<crate::db::PredictionEntry>, String> {
    get_suggestions(&state.db, &profile_id, &prefix, &language, 5).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_record_word(
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
pub fn cmd_list_word_packs(state: State<AppState>) -> Result<Vec<WordPackInfo>, String> {
    list_word_packs(&state.db).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_install_word_pack(
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
pub fn cmd_uninstall_word_pack(
    language: String,
    state: State<AppState>,
) -> Result<Vec<WordPackInfo>, String> {
    uninstall_word_pack(&state.db, &language).map_err(|e| e.to_string())?;
    list_word_packs(&state.db).map_err(|e| e.to_string())
}
