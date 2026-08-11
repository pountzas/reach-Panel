//! Cloud Groq Whisper STT for languages Windows SpeechRecognition does not support.

use super::events::{emit_error, emit_state, handle_result};
use super::route::groq_language_hint;
use super::SttState;
use anyhow::{anyhow, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use serde::Deserialize;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::AppHandle;

const GROQ_TRANSCRIPTIONS_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL: &str = "whisper-large-v3-turbo";
const TARGET_SAMPLE_RATE: u32 = 16_000;
const MIN_SPEECH_SECS: f32 = 0.8;
const SILENCE_SECS: f32 = 1.0;
const MAX_UTTERANCE_SECS: f32 = 28.0;
/// Low enough for quiet mics / shared WASAPI capture levels.
const ENERGY_THRESHOLD: f32 = 0.004;

struct GroqRuntime {
    session: Option<GroqSession>,
    lingering_worker: Option<JoinHandle<()>>,
    processing: bool,
}

/// WASAPI streams are thread-safe in practice; cpal marks them !Send for cross-platform reasons.
#[allow(dead_code)]
struct SendStream(cpal::Stream);
// SAFETY: On Windows (WASAPI) the stream is only used from the owning session and dropped once.
unsafe impl Send for SendStream {}

struct GroqSession {
    language: String,
    app_handle: AppHandle,
    stop_flag: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    _stream: SendStream,
}

static RUNTIME: OnceLock<Mutex<GroqRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<GroqRuntime> {
    RUNTIME.get_or_init(|| {
        Mutex::new(GroqRuntime {
            session: None,
            lingering_worker: None,
            processing: false,
        })
    })
}

fn set_processing(active: bool) {
    if let Ok(mut guard) = runtime().lock() {
        guard.processing = active;
    }
}

pub fn is_processing() -> bool {
    runtime()
        .lock()
        .map(|g| g.processing)
        .unwrap_or(false)
}

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

pub fn is_configured(from_settings: Option<&str>) -> bool {
    resolve_api_key(from_settings).is_some()
}

pub fn start_dictation(language: &str, api_key: &str, app: AppHandle) -> Result<()> {
    {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Groq runtime lock poisoned"))?;
        if guard.session.is_some() {
            return Err(anyhow!("Dictation is already active"));
        }
        let lingering = guard.lingering_worker.take();
        drop(guard);
        if let Some(worker) = lingering {
            let _ = worker.join();
        }
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("No default microphone found"))?;
    let supported = device
        .default_input_config()
        .map_err(|e| anyhow!("Failed to query microphone config: {e}"))?;

    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.clone().into();
    let input_rate = config.sample_rate.0;
    let channels = config.channels as usize;

    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let stop_flag = Arc::new(AtomicBool::new(false));
    let samples_cb = Arc::clone(&samples);

    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32, _>(
            &device,
            &config,
            channels,
            input_rate,
            samples_cb,
            |s| s,
        )?,
        SampleFormat::I16 => build_stream::<i16, _>(
            &device,
            &config,
            channels,
            input_rate,
            samples_cb,
            |s| s as f32 / i16::MAX as f32,
        )?,
        SampleFormat::U16 => build_stream::<u16, _>(
            &device,
            &config,
            channels,
            input_rate,
            samples_cb,
            |s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0,
        )?,
        other => return Err(anyhow!("Unsupported sample format: {other:?}")),
    };

    stream
        .play()
        .map_err(|e| anyhow!("Failed to start microphone: {e}"))?;

    let lang = language.to_string();
    let groq_lang = groq_language_hint(language).to_string();
    let api_key = api_key.to_string();
    let stop_worker = Arc::clone(&stop_flag);
    let samples_worker = Arc::clone(&samples);
    let app_worker = app.clone();
    let worker = thread::spawn(move || {
        worker_loop(
            api_key,
            groq_lang,
            samples_worker,
            stop_worker,
            app_worker,
        );
    });

    {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Groq runtime lock poisoned"))?;
        guard.session = Some(GroqSession {
            language: lang.clone(),
            app_handle: app.clone(),
            stop_flag,
            worker: Some(worker),
            _stream: SendStream(stream),
        });
    }

    emit_state(&app, SttState::Listening, Some(lang));
    Ok(())
}

fn build_stream<T, F>(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: usize,
    input_rate: u32,
    samples: Arc<Mutex<Vec<f32>>>,
    convert: F,
) -> Result<cpal::Stream>
where
    T: cpal::Sample + cpal::SizedSample + Send + 'static,
    F: Fn(T) -> f32 + Send + 'static,
{
    let err_fn = |err| eprintln!("[stt/groq] mic stream error: {err}");
    let stream = device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let mono: Vec<f32> = if channels <= 1 {
                    data.iter().copied().map(&convert).collect()
                } else {
                    data.chunks(channels)
                        .map(|frame| {
                            let sum: f32 = frame.iter().copied().map(&convert).sum();
                            sum / channels as f32
                        })
                        .collect()
                };
                let resampled = resample_linear(&mono, input_rate, TARGET_SAMPLE_RATE);
                if let Ok(mut buf) = samples.lock() {
                    buf.extend(resampled);
                    let max = TARGET_SAMPLE_RATE as usize * 60;
                    if buf.len() > max {
                        let drain = buf.len() - max;
                        buf.drain(0..drain);
                    }
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| anyhow!("Failed to open microphone stream: {e}"))?;
    Ok(stream)
}

fn worker_loop(
    api_key: String,
    language: String,
    samples: Arc<Mutex<Vec<f32>>>,
    stop_flag: Arc<AtomicBool>,
    app: AppHandle,
) {
    let mut speech_started: Option<Instant> = None;
    let mut last_voice = Instant::now();
    let mut cursor = 0usize;
    let mut peak_energy = 0.0f32;

    while !stop_flag.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(80));

        // Score energy under the lock without cloning the full buffer every tick.
        let energy = match samples.lock() {
            Ok(buf) => {
                if buf.len() <= cursor {
                    0.0
                } else {
                    let window = TARGET_SAMPLE_RATE as usize / 10; // ~100ms
                    let start = buf.len().saturating_sub(window).max(cursor);
                    rms(&buf[start..])
                }
            }
            Err(_) => continue,
        };
        peak_energy = peak_energy.max(energy);
        let now = Instant::now();
        if energy >= ENERGY_THRESHOLD {
            if speech_started.is_none() {
                speech_started = Some(now);
                eprintln!("[stt/groq] speech start energy={energy:.4}");
            }
            last_voice = now;
        }

        let speech_secs = speech_started
            .map(|t| t.elapsed().as_secs_f32())
            .unwrap_or(0.0);
        let silence_secs = last_voice.elapsed().as_secs_f32();
        let should_flush = speech_started.is_some()
            && speech_secs >= MIN_SPEECH_SECS
            && (silence_secs >= SILENCE_SECS || speech_secs >= MAX_UTTERANCE_SECS);

        if should_flush {
            if stop_flag.load(Ordering::SeqCst) {
                break;
            }
            let silence_trim =
                (silence_secs.min(SILENCE_SECS) * TARGET_SAMPLE_RATE as f32) as usize;
            let chunk = match samples.lock() {
                Ok(mut buf) => {
                    if buf.len() <= cursor {
                        None
                    } else {
                        let end = buf.len().saturating_sub(silence_trim).max(cursor);
                        let chunk = buf[cursor..end].to_vec();
                        // Drop consumed audio so the buffer does not grow forever.
                        buf.drain(0..end);
                        cursor = 0;
                        Some(chunk)
                    }
                }
                Err(_) => None,
            };
            let Some(chunk) = chunk else {
                continue;
            };
            speech_started = None;
            let flushed_peak = peak_energy;
            peak_energy = 0.0;
            let chunk_secs = chunk.len() as f32 / TARGET_SAMPLE_RATE as f32;
            if chunk_secs >= MIN_SPEECH_SECS * 0.7 {
                eprintln!(
                    "[stt/groq] flush {chunk_secs:.2}s peak={flushed_peak:.4} lang={language}"
                );
                set_processing(true);
                emit_state(&app, SttState::Processing, Some(language.clone()));
                match transcribe(&api_key, &chunk, &language) {
                    Ok(text) => {
                        eprintln!("[stt/groq] transcript len={}", text.chars().count());
                        if !stop_flag.load(Ordering::SeqCst) {
                            handle_result(&app, &text);
                        }
                    }
                    Err(err) => {
                        eprintln!("[stt/groq] transcribe error: {err}");
                        if !stop_flag.load(Ordering::SeqCst) {
                            emit_error(&app, err.to_string());
                        }
                    }
                }
                set_processing(false);
                if !stop_flag.load(Ordering::SeqCst) {
                    emit_state(&app, SttState::Listening, Some(language.clone()));
                }
            }
        }
    }
    set_processing(false);
    // Do not flush remainder on stop — keep the mic toggle responsive.
}

#[derive(Debug, Deserialize)]
struct GroqTranscriptionResponse {
    text: Option<String>,
    error: Option<GroqApiError>,
}

#[derive(Debug, Deserialize)]
struct GroqApiError {
    message: Option<String>,
}

fn transcribe(api_key: &str, audio: &[f32], language: &str) -> Result<String> {
    if audio.is_empty() {
        return Ok(String::new());
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
) -> Result<String> {
    if pcm16le.is_empty() {
        return Ok(String::new());
    }
    let samples = pcm16le_to_f32(pcm16le);
    let wav = encode_wav_pcm16(&samples, if sample_rate == 0 { TARGET_SAMPLE_RATE } else { sample_rate });
    transcribe_file_bytes(api_key, &wav, "audio.wav", "audio/wav", language)
}

/// Transcribe an encoded audio blob (m4a/wav/webm/ogg) from the tablet mic.
pub(crate) fn transcribe_file_bytes(
    api_key: &str,
    data: &[u8],
    filename: &str,
    mime: &str,
    language: &str,
) -> Result<String> {
    if data.is_empty() {
        return Ok(String::new());
    }
    let lang = groq_language_hint(language);
    let boundary = format!("----ReachPanel{}", std::process::id());
    let mut body = Vec::new();
    write_multipart_field(&mut body, &boundary, "model", GROQ_MODEL)?;
    write_multipart_field(&mut body, &boundary, "language", lang)?;
    write_multipart_field(&mut body, &boundary, "response_format", "json")?;
    write_multipart_file(&mut body, &boundary, "file", filename, mime, data)?;
    write!(body, "--{boundary}--\r\n")?;

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
            let parsed: GroqTranscriptionResponse = resp
                .into_json()
                .map_err(|e| anyhow!("GROQ_API: Failed to parse response: {e}"))?;
            if let Some(err) = parsed.error {
                let msg = err.message.unwrap_or_else(|| "Unknown API error".into());
                return Err(map_groq_http_error(401, &msg));
            }
            Ok(parsed.text.unwrap_or_default().trim().to_string())
        }
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            let message = serde_json::from_str::<GroqTranscriptionResponse>(&body)
                .ok()
                .and_then(|p| p.error.and_then(|e| e.message))
                .unwrap_or(body);
            Err(map_groq_http_error(code, &message))
        }
        Err(e) => Err(anyhow!("GROQ_API: Network error: {e}")),
    }
}

fn pcm16le_to_f32(pcm: &[u8]) -> Vec<f32> {
    let mut out = Vec::with_capacity(pcm.len() / 2);
    for chunk in pcm.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
        out.push(sample as f32 / i16::MAX as f32);
    }
    out
}

fn map_groq_http_error(code: u16, message: &str) -> anyhow::Error {
    let lower = message.to_lowercase();
    if code == 401 || code == 403 || lower.contains("invalid api key") || lower.contains("unauthorized")
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

fn write_multipart_field(body: &mut Vec<u8>, boundary: &str, name: &str, value: &str) -> Result<()> {
    write!(
        body,
        "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
    )?;
    Ok(())
}

fn write_multipart_file(
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

fn encode_wav_pcm16(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len() as u32;
    let data_size = num_samples * 2;
    let mut out = Vec::with_capacity(44 + data_size as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_size).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // PCM chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM format
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let i = (clamped * i16::MAX as f32) as i16;
        out.extend_from_slice(&i.to_le_bytes());
    }
    out
}

pub fn stop_dictation() -> Result<()> {
    let mut session = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Groq runtime lock poisoned"))?;
        match guard.session.take() {
            Some(s) => s,
            None => return Ok(()),
        }
    };

    session.stop_flag.store(true, Ordering::SeqCst);
    drop(session._stream);
    set_processing(false);
    emit_state(&session.app_handle, SttState::Idle, None);

    if let Some(worker) = session.worker.take() {
        if let Ok(mut guard) = runtime().lock() {
            if let Some(prev) = guard.lingering_worker.take() {
                thread::spawn(move || {
                    let _ = prev.join();
                });
            }
            guard.lingering_worker = Some(worker);
        } else {
            thread::spawn(move || {
                let _ = worker.join();
            });
        }
    }

    Ok(())
}

pub fn active_language() -> Option<String> {
    runtime()
        .lock()
        .ok()
        .and_then(|g| g.session.as_ref().map(|s| s.language.clone()))
}

pub fn is_active() -> bool {
    runtime()
        .lock()
        .map(|g| g.session.is_some())
        .unwrap_or(false)
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    (sum / samples.len() as f32).sqrt()
}

fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if input.is_empty() || from_rate == 0 {
        return Vec::new();
    }
    if from_rate == to_rate {
        return input.to_vec();
    }
    let ratio = to_rate as f64 / from_rate as f64;
    let out_len = ((input.len() as f64) * ratio).round().max(0.0) as usize;
    if out_len == 0 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(out_len);
    let last = input.len() - 1;
    for i in 0..out_len {
        let src = i as f64 / ratio;
        let i0 = src.floor() as usize;
        let i1 = (i0 + 1).min(last);
        let t = (src - i0 as f64) as f32;
        let s0 = input[i0.min(last)];
        let s1 = input[i1];
        out.push(s0 * (1.0 - t) + s1 * t);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{encode_wav_pcm16, resample_linear, resolve_api_key};

    #[test]
    fn resample_identity() {
        let input = vec![0.0, 0.5, 1.0, -0.5];
        assert_eq!(resample_linear(&input, 16000, 16000), input);
    }

    #[test]
    fn resample_doubles_length() {
        let input = vec![0.0, 1.0, 0.0, -1.0];
        let out = resample_linear(&input, 8000, 16000);
        assert_eq!(out.len(), 8);
    }

    #[test]
    fn wav_header_size() {
        let samples = vec![0.0f32; 160];
        let wav = encode_wav_pcm16(&samples, 16000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44 + 160 * 2);
    }

    #[test]
    fn resolve_key_prefers_settings() {
        assert_eq!(
            resolve_api_key(Some("  settings-key  ")).as_deref(),
            Some("settings-key")
        );
        assert_eq!(resolve_api_key(Some("")).as_deref(), None);
        assert_eq!(resolve_api_key(Some("   ")).as_deref(), None);
    }
}
