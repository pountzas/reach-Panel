#[cfg(target_os = "windows")]
mod sapi;
#[cfg(target_os = "windows")]
mod winrt;
#[cfg(not(target_os = "windows"))]
mod stub;

use anyhow::{anyhow, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub struct TtsSettings {
    pub rate: i32,
    pub volume: u16,
    pub language: String,
}

#[cfg(target_os = "windows")]
pub fn speak_text(text: &str, settings: TtsSettings) -> Result<()> {
    if text.trim().is_empty() {
        return Ok(());
    }

    if winrt::speak_text(text, &settings).is_ok() {
        return Ok(());
    }
    sapi::speak_text(text, &settings)
}

#[cfg(not(target_os = "windows"))]
pub fn speak_text(text: &str, settings: TtsSettings) -> Result<()> {
    stub::speak_text(text, &settings)
}

#[cfg(target_os = "windows")]
pub fn list_voices() -> Result<Vec<String>> {
    let mut voices = winrt::list_voices().unwrap_or_default();
    if voices.is_empty() {
        voices = sapi::list_voices()?;
    }
    Ok(voices)
}

#[cfg(not(target_os = "windows"))]
pub fn list_voices() -> Result<Vec<String>> {
    stub::list_voices()
}

#[cfg(target_os = "windows")]
pub fn get_tts_status() -> Result<String> {
    winrt::get_status().or_else(|_| sapi::get_status())
}

#[cfg(not(target_os = "windows"))]
pub fn get_tts_status() -> Result<String> {
    stub::get_status()
}

#[cfg(target_os = "windows")]
pub fn stop_speaking() -> Result<()> {
    let _ = winrt::stop_speaking();
    sapi::stop_speaking()
}

#[cfg(not(target_os = "windows"))]
pub fn stop_speaking() -> Result<()> {
    stub::stop_speaking()
}

pub fn validate_tts() -> Result<()> {
    speak_text(
        "Accessibility keyboard ready.",
        TtsSettings {
            rate: 0,
            volume: 100,
            language: "en".to_string(),
        },
    )
    .map_err(|e| anyhow!("TTS validation failed: {e}"))
}
