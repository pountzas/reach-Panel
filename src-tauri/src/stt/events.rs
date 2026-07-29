//! Shared STT event emitters used by WinRT and Whisper backends.

use super::SttState;
use crate::input::type_text;
use anyhow::anyhow;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
struct SttStateEvent {
    state: SttState,
    language: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct SttResultEvent {
    text: String,
    is_final: bool,
}

#[derive(Debug, Clone, Serialize)]
struct SttErrorEvent {
    message: String,
}

pub fn emit_error(app: &AppHandle, message: impl Into<String>) {
    let message = map_stt_error(message.into()).to_string();
    let _ = app.emit("stt-error", SttErrorEvent { message });
}

pub fn emit_state(app: &AppHandle, state: SttState, language: Option<String>) {
    let _ = app.emit("stt-state", SttStateEvent { state, language });
}

pub fn map_stt_error(error: impl std::fmt::Display) -> anyhow::Error {
    let message = error.to_string();
    let lower = message.to_lowercase();
    if lower.contains("0x80045509")
        || lower.contains("speech privacy policy")
        || lower.contains("privacy statement")
    {
        return anyhow!(
            "SPEECH_PRIVACY: Online speech recognition is turned off in Windows. Open Settings → Privacy & security → Speech and turn on Online speech recognition, then try again."
        );
    }
    anyhow!("{message}")
}

pub fn handle_result(app: &AppHandle, text: &str) {
    let text = text.trim();
    if text.is_empty() {
        return;
    }
    // Whisper sometimes emits tokens like "[Blank audio]" / "(silence)".
    let lower = text.to_lowercase();
    if lower.contains("blank audio")
        || lower == "[silence]"
        || lower == "(silence)"
        || lower == "you"
    {
        return;
    }
    if let Err(error) = type_text(text) {
        emit_error(app, error.to_string());
        return;
    }
    let _ = app.emit(
        "stt-result",
        SttResultEvent {
            text: text.to_string(),
            is_final: true,
        },
    );
}
