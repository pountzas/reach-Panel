use super::{SttState, SttStatus};
use anyhow::{anyhow, Result};
use tauri::AppHandle;

pub fn start_dictation(_language: &str, _app: AppHandle) -> Result<()> {
    Err(anyhow!(
        "Speech-to-text is not yet supported on this platform. Windows build required."
    ))
}

pub fn stop_dictation() -> Result<()> {
    Ok(())
}

pub fn get_status() -> SttStatus {
    SttStatus {
        state: SttState::Idle,
        language: None,
    }
}
