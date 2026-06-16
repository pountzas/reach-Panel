use anyhow::{anyhow, Result};

use super::TtsSettings;

pub fn speak_text(_text: &str, _settings: &TtsSettings) -> Result<()> {
    Err(anyhow!(
        "Text-to-speech is not yet supported on this platform. Windows build required."
    ))
}

pub fn list_voices() -> Result<Vec<String>> {
    Ok(vec![])
}

pub fn get_status() -> Result<String> {
    Ok("unavailable".to_string())
}

pub fn stop_speaking() -> Result<()> {
    Ok(())
}
