use crate::stt::{get_status as get_stt_status, start_dictation, stop_dictation, SttStatus};
use tauri::{AppHandle, Manager};

fn companion_tablet_audio_active(app: &AppHandle) -> bool {
    app.try_state::<crate::companion::CompanionBridge>()
        .map(|bridge| bridge.session().tablet_audio_active())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn cmd_start_dictation(
    language: String,
    groq_api_key: Option<String>,
    app: AppHandle,
) -> Result<(), String> {
    if companion_tablet_audio_active(&app) || crate::companion::dictation_is_active() {
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
pub async fn cmd_stop_dictation() -> Result<(), String> {
    tokio::task::spawn_blocking(|| stop_dictation().map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cmd_get_stt_status(
    language: Option<String>,
    groq_api_key: Option<String>,
) -> Result<SttStatus, String> {
    Ok(get_stt_status(language.as_deref(), groq_api_key.as_deref()))
}
