//! Cloud Groq Whisper STT for companion tablet audio.

mod audio;
mod http;

#[cfg(test)]
mod tests;

pub(super) const GROQ_TRANSCRIPTIONS_URL: &str =
    "https://api.groq.com/openai/v1/audio/transcriptions";
pub(super) const GROQ_MODEL: &str = "whisper-large-v3-turbo";
pub(super) const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Resolve API key from settings value, then `GROQ_API_KEY` env.
pub fn resolve_api_key(from_settings: Option<&str>) -> Option<String> {
    if let Some(key) = from_settings.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(key.to_string());
    }
    std::env::var("GROQ_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) use http::{transcribe_file_bytes, transcribe_pcm16_le};
