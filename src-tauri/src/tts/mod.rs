mod sapi;
mod winrt;

use anyhow::{anyhow, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TtsSettings {
    pub rate: i32,
    pub volume: u16,
    pub language: String,
}

pub fn speak_text(text: &str, settings: TtsSettings) -> Result<()> {
    if text.trim().is_empty() {
        return Ok(());
    }

    if winrt::speak_text(text, &settings).is_ok() {
        return Ok(());
    }
    sapi::speak_text(text, &settings)
}

pub fn list_voices() -> Result<Vec<String>> {
    let mut voices = winrt::list_voices().unwrap_or_default();
    if voices.is_empty() {
        voices = sapi::list_voices()?;
    }
    Ok(voices)
}

pub fn get_tts_status() -> Result<String> {
    winrt::get_status().or_else(|_| sapi::get_status())
}

pub fn stop_speaking() -> Result<()> {
    let _ = winrt::stop_speaking();
    sapi::stop_speaking()
}

pub fn validate_tts() -> Result<()> {
    speak_text(
        "ReachPanel ready.",
        TtsSettings {
            rate: 0,
            volume: 100,
            language: "en".to_string(),
        },
    )
    .map_err(|e| anyhow!("TTS validation failed: {e}"))
}
