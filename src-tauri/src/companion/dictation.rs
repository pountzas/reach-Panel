//! Companion remote dictation: tablet mic audio → host Groq STT → SendInput.

use crate::db::Database;
use crate::profiles::INTERNAL_PROFILE_ID;
use crate::stt::events::{emit_groq_quota_optional, handle_result};
use crate::stt::groq;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use std::sync::Mutex;
use tauri::AppHandle;

const DEFAULT_SAMPLE_RATE: u32 = 16_000;
/// Flush PCM buffer for interim transcripts (~2s at 16kHz mono PCM16).
const PCM_FLUSH_BYTES: usize = DEFAULT_SAMPLE_RATE as usize * 2 * 2;

#[derive(Debug, Default)]
struct Session {
    language: String,
    sample_rate: u32,
    pcm: Vec<u8>,
    encoded: Option<EncodedAudio>,
    active: bool,
}

#[derive(Debug, Clone)]
struct EncodedAudio {
    data: Vec<u8>,
    filename: String,
    mime: String,
}

static SESSION: Mutex<Session> = Mutex::new(Session {
    language: String::new(),
    sample_rate: DEFAULT_SAMPLE_RATE,
    pcm: Vec::new(),
    encoded: None,
    active: false,
});

pub fn is_active() -> bool {
    SESSION
        .lock()
        .map(|g| g.active)
        .unwrap_or(false)
}

pub fn abort() {
    if let Ok(mut guard) = SESSION.lock() {
        *guard = Session::default();
    }
}

pub fn start(language: &str, sample_rate: Option<u32>, db: &Database) -> Result<serde_json::Value, String> {
    let key = resolve_host_groq_key(db)?;
    let _ = key; // validated now; used on flush
    let mut guard = SESSION.lock().map_err(|_| "dictation lock")?;
    if guard.active {
        return Err("Dictation already active".to_string());
    }
    *guard = Session {
        language: if language.trim().is_empty() {
            "en".to_string()
        } else {
            language.trim().to_string()
        },
        sample_rate: sample_rate.unwrap_or(DEFAULT_SAMPLE_RATE).max(8_000),
        pcm: Vec::new(),
        encoded: None,
        active: true,
    };
    Ok(serde_json::json!({
        "engine": "groq",
        "sampleRate": guard.sample_rate,
        "audioRouting": "tablet",
    }))
}

pub fn push_chunk(payload: &serde_json::Value, app: &AppHandle, db: &Database) -> Result<Vec<serde_json::Value>, String> {
    let mut events = Vec::new();
    let mut guard = SESSION.lock().map_err(|_| "dictation lock")?;
    if !guard.active {
        return Err("Dictation not started".to_string());
    }

    let data_b64 = payload
        .get("data")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if data_b64.is_empty() {
        return Ok(events);
    }
    let bytes = B64
        .decode(data_b64.trim())
        .map_err(|e| format!("Invalid audio base64: {e}"))?;

    let format = payload
        .get("format")
        .and_then(|v| v.as_str())
        .unwrap_or("pcm16le");

    match format {
        "pcm16le" | "pcm16" => {
            if let Some(sr) = payload.get("sampleRate").and_then(|v| v.as_u64()) {
                guard.sample_rate = (sr as u32).max(8_000);
            }
            guard.pcm.extend_from_slice(&bytes);
            let should_flush = guard.pcm.len() >= PCM_FLUSH_BYTES;
            if should_flush {
                let language = guard.language.clone();
                let sample_rate = guard.sample_rate;
                let pcm = std::mem::take(&mut guard.pcm);
                drop(guard);
                if let Some(text) = transcribe_pcm(app, db, &pcm, sample_rate, &language)? {
                    events.push(serde_json::json!({
                        "type": "dictation.partial",
                        "text": text,
                        "isFinal": false,
                    }));
                }
            }
        }
        "m4a" | "mp4" | "aac" | "wav" | "webm" | "ogg" | "encoded" => {
            let mime = payload
                .get("mimeType")
                .and_then(|v| v.as_str())
                .unwrap_or(match format {
                    "wav" => "audio/wav",
                    "webm" => "audio/webm",
                    "ogg" => "audio/ogg",
                    _ => "audio/mp4",
                })
                .to_string();
            let filename = payload
                .get("filename")
                .and_then(|v| v.as_str())
                .unwrap_or(match format {
                    "wav" => "audio.wav",
                    "webm" => "audio.webm",
                    "ogg" => "audio.ogg",
                    _ => "audio.m4a",
                })
                .to_string();
            guard.encoded = Some(EncodedAudio {
                data: bytes,
                filename,
                mime,
            });
        }
        other => {
            return Err(format!("Unsupported audio format: {other}"));
        }
    }

    Ok(events)
}

pub fn stop(app: &AppHandle, db: &Database) -> Result<serde_json::Value, String> {
    let mut guard = SESSION.lock().map_err(|_| "dictation lock")?;
    if !guard.active {
        return Err("Dictation not started".to_string());
    }
    let language = guard.language.clone();
    let sample_rate = guard.sample_rate;
    let pcm = std::mem::take(&mut guard.pcm);
    let encoded = guard.encoded.take();
    guard.active = false;
    drop(guard);

    let mut last_text = String::new();

    if let Some(enc) = encoded {
        if let Some(text) = transcribe_encoded(app, db, &enc, &language)? {
            last_text = text;
        }
    } else if !pcm.is_empty() {
        if let Some(text) = transcribe_pcm(app, db, &pcm, sample_rate, &language)? {
            last_text = text;
        }
    }

    Ok(serde_json::json!({
        "text": last_text,
        "isFinal": true,
    }))
}

fn resolve_host_groq_key(db: &Database) -> Result<String, String> {
    let from_settings = db
        .get_profile_by_id(INTERNAL_PROFILE_ID)
        .map_err(|e| e.to_string())?
        .and_then(|p| {
            serde_json::from_str::<serde_json::Value>(&p.settings_json)
                .ok()
                .and_then(|v| {
                    v.get("groqApiKey")
                        .and_then(|k| k.as_str())
                        .map(|s| s.to_string())
                })
        });
    groq::resolve_api_key(from_settings.as_deref()).ok_or_else(|| {
        "GROQ_KEY: Companion dictation needs a Groq API key on the host (Settings). Keys never sync to the tablet.".to_string()
    })
}

fn transcribe_pcm(
    app: &AppHandle,
    db: &Database,
    pcm: &[u8],
    sample_rate: u32,
    language: &str,
) -> Result<Option<String>, String> {
    if pcm.len() < sample_rate as usize {
        // < ~0.5s of mono PCM16 — skip
        return Ok(None);
    }
    let key = resolve_host_groq_key(db)?;
    let result = match groq::transcribe_pcm16_le(&key, pcm, sample_rate, language) {
        Ok(result) => {
            emit_groq_quota_optional(
                app,
                result.quota.remaining_requests,
                result.quota.limit_requests,
            );
            result
        }
        Err(err) => {
            emit_groq_quota_optional(
                app,
                err.quota.remaining_requests,
                err.quota.limit_requests,
            );
            return Err(err.to_string());
        }
    };
    if result.text.is_empty() {
        return Ok(None);
    }
    // Type via shared path (also emits desktop stt-result for consistency).
    handle_result(app, &result.text);
    // handle_result already typed; if it filtered blank audio, check again.
    let trimmed = result.text.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    // Ensure typing happened even if handle_result filtered — re-check filter locally.
    Ok(Some(trimmed.to_string()))
}

fn transcribe_encoded(
    app: &AppHandle,
    db: &Database,
    enc: &EncodedAudio,
    language: &str,
) -> Result<Option<String>, String> {
    let key = resolve_host_groq_key(db)?;
    let result = match groq::transcribe_file_bytes(
        &key,
        &enc.data,
        &enc.filename,
        &enc.mime,
        language,
    ) {
        Ok(result) => {
            emit_groq_quota_optional(
                app,
                result.quota.remaining_requests,
                result.quota.limit_requests,
            );
            result
        }
        Err(err) => {
            emit_groq_quota_optional(
                app,
                err.quota.remaining_requests,
                err.quota.limit_requests,
            );
            return Err(err.to_string());
        }
    };
    if result.text.trim().is_empty() {
        return Ok(None);
    }
    handle_result(app, &result.text);
    Ok(Some(result.text.trim().to_string()))
}
