//! Groq transcriptions HTTP client (multipart upload + quota headers).

use super::audio::{encode_wav_pcm16, pcm16le_to_f32};
use super::super::route::groq_language_hint;
use super::{GROQ_MODEL, GROQ_TRANSCRIPTIONS_URL, TARGET_SAMPLE_RATE};
use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::io::Write;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct GroqTranscriptionResponse {
    text: Option<String>,
    error: Option<GroqApiError>,
}

#[derive(Debug, Deserialize)]
struct GroqApiError {
    message: Option<String>,
}

/// RPD headers from Groq (`x-ratelimit-*-requests`).
#[derive(Debug, Clone, Default)]
pub struct GroqRequestQuota {
    pub remaining_requests: Option<u64>,
    pub limit_requests: Option<u64>,
}

#[derive(Debug)]
pub struct GroqTranscription {
    pub text: String,
    pub quota: GroqRequestQuota,
}

#[derive(Debug)]
pub struct GroqTranscribeError {
    message: String,
    pub quota: GroqRequestQuota,
}

impl GroqTranscribeError {
    fn new(message: impl Into<String>, quota: GroqRequestQuota) -> Self {
        Self {
            message: message.into(),
            quota,
        }
    }
}

impl std::fmt::Display for GroqTranscribeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for GroqTranscribeError {}

impl From<anyhow::Error> for GroqTranscribeError {
    fn from(value: anyhow::Error) -> Self {
        Self::new(value.to_string(), GroqRequestQuota::default())
    }
}

pub(super) fn parse_quota_headers(resp: &ureq::Response) -> GroqRequestQuota {
    GroqRequestQuota {
        remaining_requests: resp
            .header("x-ratelimit-remaining-requests")
            .and_then(|v| v.parse().ok()),
        limit_requests: resp
            .header("x-ratelimit-limit-requests")
            .and_then(|v| v.parse().ok()),
    }
}

/// Remaining RPD percent from Groq request headers (0–100).
#[allow(dead_code)] // used by unit tests; percent display lives on the frontend
pub fn groq_remaining_percent(remaining: u64, limit: u64) -> u32 {
    if limit == 0 {
        return 0;
    }
    let pct = ((100.0 * remaining as f64) / limit as f64).round() as i64;
    pct.clamp(0, 100) as u32
}

pub(super) fn transcribe(
    api_key: &str,
    audio: &[f32],
    language: &str,
) -> Result<GroqTranscription, GroqTranscribeError> {
    if audio.is_empty() {
        return Ok(GroqTranscription {
            text: String::new(),
            quota: GroqRequestQuota::default(),
        });
    }
    let wav = encode_wav_pcm16(audio, TARGET_SAMPLE_RATE);
    transcribe_file_bytes(api_key, &wav, "audio.wav", "audio/wav", language)
}

/// Transcribe companion-provided PCM16 LE mono audio (any sample rate; resampled lightly by length).
pub(crate) fn transcribe_pcm16_le(
    api_key: &str,
    pcm16le: &[u8],
    sample_rate: u32,
    language: &str,
) -> Result<GroqTranscription, GroqTranscribeError> {
    if pcm16le.is_empty() {
        return Ok(GroqTranscription {
            text: String::new(),
            quota: GroqRequestQuota::default(),
        });
    }
    let samples = pcm16le_to_f32(pcm16le);
    let wav = encode_wav_pcm16(
        &samples,
        if sample_rate == 0 {
            TARGET_SAMPLE_RATE
        } else {
            sample_rate
        },
    );
    transcribe_file_bytes(api_key, &wav, "audio.wav", "audio/wav", language)
}

/// Transcribe an encoded audio blob (m4a/wav/webm/ogg) from the tablet mic.
pub(crate) fn transcribe_file_bytes(
    api_key: &str,
    data: &[u8],
    filename: &str,
    mime: &str,
    language: &str,
) -> Result<GroqTranscription, GroqTranscribeError> {
    if data.is_empty() {
        return Ok(GroqTranscription {
            text: String::new(),
            quota: GroqRequestQuota::default(),
        });
    }
    let lang = groq_language_hint(language);
    let boundary = format!("----ReachPanel{}", std::process::id());
    let mut body = Vec::new();
    write_multipart_field(&mut body, &boundary, "model", GROQ_MODEL)
        .map_err(GroqTranscribeError::from)?;
    write_multipart_field(&mut body, &boundary, "language", lang)
        .map_err(GroqTranscribeError::from)?;
    write_multipart_field(&mut body, &boundary, "response_format", "json")
        .map_err(GroqTranscribeError::from)?;
    write_multipart_file(&mut body, &boundary, "file", filename, mime, data)
        .map_err(GroqTranscribeError::from)?;
    write!(body, "--{boundary}--\r\n").map_err(|e| GroqTranscribeError::from(anyhow!("{e}")))?;

    let response = ureq::post(GROQ_TRANSCRIPTIONS_URL)
        .set("Authorization", &format!("Bearer {api_key}"))
        .set(
            "Content-Type",
            &format!("multipart/form-data; boundary={boundary}"),
        )
        .timeout(Duration::from_secs(60))
        .send_bytes(&body);

    match response {
        Ok(resp) => {
            let quota = parse_quota_headers(&resp);
            let parsed: GroqTranscriptionResponse = resp.into_json().map_err(|e| {
                GroqTranscribeError::new(
                    format!("GROQ_API: Failed to parse response: {e}"),
                    quota.clone(),
                )
            })?;
            if let Some(err) = parsed.error {
                let msg = err.message.unwrap_or_else(|| "Unknown API error".into());
                return Err(GroqTranscribeError::new(
                    map_groq_http_error(401, &msg).to_string(),
                    quota,
                ));
            }
            Ok(GroqTranscription {
                text: parsed.text.unwrap_or_default().trim().to_string(),
                quota,
            })
        }
        Err(ureq::Error::Status(code, resp)) => {
            let quota = parse_quota_headers(&resp);
            let body = resp.into_string().unwrap_or_default();
            let message = serde_json::from_str::<GroqTranscriptionResponse>(&body)
                .ok()
                .and_then(|p| p.error.and_then(|e| e.message))
                .unwrap_or(body);
            Err(GroqTranscribeError::new(
                map_groq_http_error(code, &message).to_string(),
                quota,
            ))
        }
        Err(e) => Err(GroqTranscribeError::new(
            format!("GROQ_API: Network error: {e}"),
            GroqRequestQuota::default(),
        )),
    }
}

pub(super) fn map_groq_http_error(code: u16, message: &str) -> anyhow::Error {
    let lower = message.to_lowercase();
    if code == 401
        || code == 403
        || lower.contains("invalid api key")
        || lower.contains("unauthorized")
    {
        return anyhow!(
            "GROQ_KEY: Groq API key is missing or invalid. Add a free key in Settings (or set GROQ_API_KEY)."
        );
    }
    if code == 429 {
        return anyhow!("GROQ_API: Groq rate limit reached. Wait a moment and try again.");
    }
    anyhow!("GROQ_API: {message}")
}

pub(super) fn write_multipart_field(
    body: &mut Vec<u8>,
    boundary: &str,
    name: &str,
    value: &str,
) -> Result<()> {
    write!(
        body,
        "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
    )?;
    Ok(())
}

pub(super) fn write_multipart_file(
    body: &mut Vec<u8>,
    boundary: &str,
    name: &str,
    filename: &str,
    content_type: &str,
    data: &[u8],
) -> Result<()> {
    write!(
        body,
        "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n"
    )?;
    body.extend_from_slice(data);
    write!(body, "\r\n")?;
    Ok(())
}

