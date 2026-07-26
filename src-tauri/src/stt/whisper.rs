//! Local Whisper STT (whisper-rs + ggml-tiny) for offline / unsupported languages.

use super::events::{emit_error, emit_state, handle_result};
use super::route::whisper_language_hint;
use super::{SttState, WhisperDownloadEvent};
use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const MODEL_FILE: &str = "ggml-tiny.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin";
const TARGET_SAMPLE_RATE: u32 = 16_000;
const MIN_SPEECH_SECS: f32 = 0.7;
const SILENCE_SECS: f32 = 1.1;
const MAX_UTTERANCE_SECS: f32 = 28.0;
const ENERGY_THRESHOLD: f32 = 0.012;

struct WhisperRuntime {
    model_dir: PathBuf,
    ctx: Option<Arc<WhisperContext>>,
    download_in_progress: bool,
    session: Option<WhisperSession>,
}

/// WASAPI streams are thread-safe in practice; cpal marks them !Send for cross-platform reasons.
#[allow(dead_code)]
struct SendStream(cpal::Stream);
// SAFETY: On Windows (WASAPI) the stream is only used from the owning session and dropped once.
unsafe impl Send for SendStream {}

struct WhisperSession {
    language: String,
    app_handle: AppHandle,
    stop_flag: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    _stream: SendStream,
}

static RUNTIME: OnceLock<Mutex<WhisperRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<WhisperRuntime> {
    RUNTIME.get_or_init(|| {
        Mutex::new(WhisperRuntime {
            model_dir: PathBuf::new(),
            ctx: None,
            download_in_progress: false,
            session: None,
        })
    })
}

pub fn init(model_dir: PathBuf) {
    if let Ok(mut guard) = runtime().lock() {
        guard.model_dir = model_dir;
        let path = guard.model_dir.join(MODEL_FILE);
        if path.is_file() {
            match load_context(&path) {
                Ok(ctx) => guard.ctx = Some(Arc::new(ctx)),
                Err(err) => eprintln!("[stt/whisper] failed to load model: {err}"),
            }
        }
    }
}

fn model_path(dir: &Path) -> PathBuf {
    dir.join(MODEL_FILE)
}

fn load_context(path: &Path) -> Result<WhisperContext> {
    WhisperContext::new_with_params(
        path.to_str().ok_or_else(|| anyhow!("Invalid model path"))?,
        WhisperContextParameters::default(),
    )
    .map_err(|e| anyhow!("Failed to load Whisper model: {e}"))
}

pub fn is_ready() -> bool {
    runtime()
        .lock()
        .map(|g| g.ctx.is_some())
        .unwrap_or(false)
}

pub fn is_downloading() -> bool {
    runtime()
        .lock()
        .map(|g| g.download_in_progress)
        .unwrap_or(false)
}

/// Ensure the ggml-tiny model is downloaded and loaded. Emits progress events.
pub fn ensure_model(app: AppHandle) -> Result<()> {
    let (model_dir, already_ready) = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Whisper runtime lock poisoned"))?;
        if guard.model_dir.as_os_str().is_empty() {
            return Err(anyhow!("Whisper model directory not initialized"));
        }
        if guard.ctx.is_some() {
            return Ok(());
        }
        if guard.download_in_progress {
            return Ok(());
        }
        guard.download_in_progress = true;
        (guard.model_dir.clone(), false)
    };
    let _ = already_ready;

    let path = model_path(&model_dir);
    let app_progress = app.clone();

    let result = (|| -> Result<()> {
        fs::create_dir_all(&model_dir)?;
        if !path.is_file() {
            download_model(&path, &app_progress)?;
        }
        let ctx = load_context(&path)?;
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Whisper runtime lock poisoned"))?;
        guard.ctx = Some(Arc::new(ctx));
        guard.download_in_progress = false;
        let _ = app_progress.emit(
            "stt-whisper-download",
            WhisperDownloadEvent {
                progress: 1.0,
                ready: true,
                error: None,
            },
        );
        Ok(())
    })();

    if let Err(err) = &result {
        if let Ok(mut guard) = runtime().lock() {
            guard.download_in_progress = false;
        }
        let _ = app.emit(
            "stt-whisper-download",
            WhisperDownloadEvent {
                progress: 0.0,
                ready: false,
                error: Some(err.to_string()),
            },
        );
    }
    result
}

fn download_model(path: &Path, app: &AppHandle) -> Result<()> {
    let partial = path.with_extension("bin.partial");
    if partial.exists() {
        let _ = fs::remove_file(&partial);
    }

    let response = ureq::get(MODEL_URL)
        .call()
        .map_err(|e| anyhow!("WHISPER_MODEL: Failed to download speech model: {e}"))?;
    let total = response
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    let mut reader = response.into_reader();
    let mut file = File::create(&partial).context("Failed to create model file")?;
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded = 0u64;
    let mut last_emit = Instant::now();

    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n])?;
        downloaded += n as u64;
        if last_emit.elapsed() >= Duration::from_millis(200) {
            let progress = if total > 0 {
                (downloaded as f64 / total as f64).clamp(0.0, 0.99)
            } else {
                0.0
            };
            let _ = app.emit(
                "stt-whisper-download",
                WhisperDownloadEvent {
                    progress,
                    ready: false,
                    error: None,
                },
            );
            last_emit = Instant::now();
        }
    }
    file.flush()?;
    drop(file);
    fs::rename(&partial, path).context("Failed to finalize model download")?;
    Ok(())
}

pub fn start_dictation(language: &str, app: AppHandle) -> Result<()> {
    let ctx = {
        let guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Whisper runtime lock poisoned"))?;
        if guard.session.is_some() {
            return Err(anyhow!("Dictation is already active"));
        }
        guard
            .ctx
            .clone()
            .ok_or_else(|| anyhow!("WHISPER_MODEL: Local speech model is not ready yet."))?
    };

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
    let whisper_lang = whisper_language_hint(language).to_string();
    let stop_worker = Arc::clone(&stop_flag);
    let samples_worker = Arc::clone(&samples);
    let app_worker = app.clone();
    let worker = thread::spawn(move || {
        worker_loop(
            ctx,
            whisper_lang,
            samples_worker,
            stop_worker,
            app_worker,
        );
    });

    {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Whisper runtime lock poisoned"))?;
        guard.session = Some(WhisperSession {
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
    let err_fn = |err| eprintln!("[stt/whisper] mic stream error: {err}");
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
                    // Cap buffer to ~60s to avoid unbounded growth.
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
    ctx: Arc<WhisperContext>,
    language: String,
    samples: Arc<Mutex<Vec<f32>>>,
    stop_flag: Arc<AtomicBool>,
    app: AppHandle,
) {
    let mut speech_started: Option<Instant> = None;
    let mut last_voice = Instant::now();
    let mut cursor = 0usize;

    while !stop_flag.load(Ordering::SeqCst) {
        thread::sleep(Duration::from_millis(80));
        let snapshot = match samples.lock() {
            Ok(buf) => buf.clone(),
            Err(_) => continue,
        };
        if snapshot.len() <= cursor {
            continue;
        }
        let new_slice = &snapshot[cursor..];
        let energy = rms(new_slice);
        let now = Instant::now();
        if energy >= ENERGY_THRESHOLD {
            if speech_started.is_none() {
                speech_started = Some(now);
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
            let end = snapshot.len().saturating_sub(
                (silence_secs.min(SILENCE_SECS) * TARGET_SAMPLE_RATE as f32) as usize,
            );
            let end = end.max(cursor);
            let chunk = snapshot[cursor..end].to_vec();
            cursor = end;
            speech_started = None;
            if chunk.len() as f32 / TARGET_SAMPLE_RATE as f32 >= MIN_SPEECH_SECS * 0.8 {
                emit_state(&app, SttState::Processing, Some(language.clone()));
                match transcribe(&ctx, &chunk, &language) {
                    Ok(text) => handle_result(&app, &text),
                    Err(err) => emit_error(&app, err.to_string()),
                }
                if !stop_flag.load(Ordering::SeqCst) {
                    emit_state(&app, SttState::Listening, Some(language.clone()));
                }
            }
        }
    }

    // Flush remainder on stop.
    let remainder = match samples.lock() {
        Ok(buf) => buf.get(cursor..).map(|s| s.to_vec()).unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    if remainder.len() as f32 / TARGET_SAMPLE_RATE as f32 >= MIN_SPEECH_SECS * 0.6 {
        emit_state(&app, SttState::Processing, Some(language.clone()));
        match transcribe(&ctx, &remainder, &language) {
            Ok(text) => handle_result(&app, &text),
            Err(err) => emit_error(&app, err.to_string()),
        }
    }
}

fn transcribe(ctx: &WhisperContext, audio: &[f32], language: &str) -> Result<String> {
    if audio.is_empty() {
        return Ok(String::new());
    }
    let mut state = ctx
        .create_state()
        .map_err(|e| anyhow!("Failed to create Whisper state: {e}"))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(language));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_no_speech_thold(0.5);
    params.set_n_threads(num_cpus_hint());

    state
        .full(params, audio)
        .map_err(|e| anyhow!("Whisper transcription failed: {e}"))?;

    let mut out = String::new();
    for segment in state.as_iter() {
        let trimmed = segment.to_string().trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(&trimmed);
    }
    Ok(out)
}

fn num_cpus_hint() -> i32 {
    std::thread::available_parallelism()
        .map(|n| n.get().clamp(1, 4) as i32)
        .unwrap_or(2)
}

pub fn stop_dictation() -> Result<()> {
    let mut session = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Whisper runtime lock poisoned"))?;
        match guard.session.take() {
            Some(s) => s,
            None => return Ok(()),
        }
    };

    session.stop_flag.store(true, Ordering::SeqCst);
    // Drop stream to stop capture before joining worker.
    drop(session._stream);
    if let Some(worker) = session.worker.take() {
        let _ = worker.join();
    }

    emit_state(&session.app_handle, SttState::Idle, None);
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
    use super::resample_linear;

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
}
