use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicFilePayload {
    path: String,
    content_base64: String,
}

#[tauri::command]
pub fn cmd_read_music_file(app: tauri::AppHandle, path: String) -> Result<MusicFilePayload, String> {
    let bytes = crate::music::read_music_file_bytes(&app, &path)?;
    Ok(MusicFilePayload {
        path,
        content_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes),
    })
}

#[tauri::command]
pub fn cmd_list_imported_songs(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Array(crate::music::list_imported_songs(
        &app,
    )?))
}

#[tauri::command]
pub fn cmd_upsert_imported_song(
    app: tauri::AppHandle,
    song: serde_json::Value,
) -> Result<serde_json::Value, String> {
    crate::music::upsert_imported_song(&app, song)
}

#[tauri::command]
pub fn cmd_delete_imported_song(app: tauri::AppHandle, id: String) -> Result<(), String> {
    crate::music::delete_imported_song(&app, &id)
}

#[tauri::command]
pub fn cmd_list_custom_language_packs(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::Value::Array(
        crate::language::list_custom_language_packs(&app)?,
    ))
}

#[tauri::command]
pub fn cmd_upsert_custom_language_pack(
    app: tauri::AppHandle,
    pack: serde_json::Value,
) -> Result<serde_json::Value, String> {
    crate::language::upsert_custom_language_pack(&app, pack)
}

#[tauri::command]
pub fn cmd_delete_custom_language_pack(app: tauri::AppHandle, id: String) -> Result<(), String> {
    crate::language::delete_custom_language_pack(&app, &id)
}
