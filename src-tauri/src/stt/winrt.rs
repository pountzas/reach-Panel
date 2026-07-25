use super::{SttState, SttStatus};
use crate::input::type_text;
use anyhow::{anyhow, Result};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use windows::core::HSTRING;
use windows::Foundation::{EventRegistrationToken, TypedEventHandler};
use windows::Globalization::Language;
use windows::Media::SpeechRecognition::{
    SpeechContinuousRecognitionCompletedEventArgs,
    SpeechContinuousRecognitionResultGeneratedEventArgs, SpeechRecognitionResultStatus,
    SpeechRecognizer,
};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

#[derive(Debug, Clone, serde::Serialize)]
struct SttStateEvent {
    state: SttState,
    language: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct SttResultEvent {
    text: String,
    is_final: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
struct SttErrorEvent {
    message: String,
}

struct ActiveSession {
    recognizer: SpeechRecognizer,
    result_token: EventRegistrationToken,
    completed_token: EventRegistrationToken,
    language: String,
}

struct DictationRuntime {
    session: Option<ActiveSession>,
    app_handle: Option<AppHandle>,
}

impl Default for DictationRuntime {
    fn default() -> Self {
        Self {
            session: None,
            app_handle: None,
        }
    }
}

static RUNTIME: OnceLock<Mutex<DictationRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<DictationRuntime> {
    RUNTIME.get_or_init(|| Mutex::new(DictationRuntime::default()))
}

fn ensure_winrt() -> Result<()> {
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED).ok();
    }
    Ok(())
}

fn language_tag(language: &str) -> &'static str {
    match language {
        "el" => "el-GR",
        _ => "en-US",
    }
}

fn emit_error(app: &AppHandle, message: impl Into<String>) {
    let message = map_stt_error(message.into()).to_string();
    let _ = app.emit("stt-error", SttErrorEvent { message });
}

fn emit_state(app: &AppHandle, state: SttState, language: Option<String>) {
    let _ = app.emit(
        "stt-state",
        SttStateEvent {
            state,
            language,
        },
    );
}

fn map_stt_error(error: impl std::fmt::Display) -> anyhow::Error {
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

fn language_supported(tag: &str) -> Result<()> {
    let supported = SpeechRecognizer::SupportedTopicLanguages()?;
    let size = supported.Size()?;
    for i in 0..size {
        let lang = supported.GetAt(i)?;
        if lang.LanguageTag()?.to_string().eq_ignore_ascii_case(tag) {
            return Ok(());
        }
    }
    Err(anyhow!(
        "SPEECH_LANGUAGE: No speech recognition language found for '{tag}'. Install the speech pack in Windows Settings → Time & language → Speech (or Language & region), then try again."
    ))
}

fn handle_result(app: &AppHandle, text: &str) {
    if text.is_empty() {
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

pub fn start_dictation(language: &str, app: AppHandle) -> Result<()> {
    ensure_winrt()?;

    let tag = language_tag(language);
    language_supported(tag)?;

    let mut guard = runtime()
        .lock()
        .map_err(|_| anyhow!("Dictation runtime lock poisoned"))?;

    if guard.session.is_some() {
        return Err(anyhow!("Dictation is already active"));
    }

    let win_lang = Language::CreateLanguage(&HSTRING::from(tag))?;
    let recognizer = SpeechRecognizer::Create(&win_lang)?;

    let compile = recognizer.CompileConstraintsAsync()?;
    let compilation = compile
        .get()
        .map_err(|e| anyhow!("Failed to compile speech constraints: {e}"))?;
    if compilation.Status()? != windows::Media::SpeechRecognition::SpeechRecognitionResultStatus::Success {
        return Err(anyhow!(
            "Speech recognition constraints failed to compile for '{tag}'"
        ));
    }

    let session = recognizer.ContinuousRecognitionSession()?;
    let app_for_results = app.clone();
    let result_token = session.ResultGenerated(&TypedEventHandler::new(
        move |_sender, args: &Option<SpeechContinuousRecognitionResultGeneratedEventArgs>| {
            let Some(args) = args else {
                return Ok(());
            };
            let Ok(result) = args.Result() else {
                return Ok(());
            };
            if result.Status()? != SpeechRecognitionResultStatus::Success {
                return Ok(());
            }
            let text = result.Text()?.to_string();
            handle_result(&app_for_results, &text);
            Ok(())
        },
    ))?;

    let app_for_completed = app.clone();
    let completed_token = session.Completed(&TypedEventHandler::new(
        move |_sender, args: &Option<SpeechContinuousRecognitionCompletedEventArgs>| {
            if let Ok(mut guard) = runtime().lock() {
                guard.session = None;
            }
            if let Some(args) = args {
                if let Ok(status) = args.Status() {
                    if status != SpeechRecognitionResultStatus::Success {
                        emit_error(
                            &app_for_completed,
                            format!("Dictation ended with status: {status:?}"),
                        );
                    }
                }
            }
            emit_state(&app_for_completed, SttState::Idle, None);
            Ok(())
        },
    ))?;

    let start = session.StartAsync()?;
    start
        .get()
        .map_err(|e| map_stt_error(format!("Failed to start dictation: {e}")))?;

    guard.app_handle = Some(app.clone());
    guard.session = Some(ActiveSession {
        recognizer,
        result_token,
        completed_token,
        language: language.to_string(),
    });

    emit_state(&app, SttState::Listening, Some(language.to_string()));
    Ok(())
}

pub fn stop_dictation() -> Result<()> {
    let mut guard = runtime()
        .lock()
        .map_err(|_| anyhow!("Dictation runtime lock poisoned"))?;

    let Some(active) = guard.session.take() else {
        return Ok(());
    };

    let app = guard.app_handle.clone();
    let session = active.recognizer.ContinuousRecognitionSession()?;
    let stop = session.StopAsync()?;
    let _ = stop.get();

    let _ = session.RemoveResultGenerated(active.result_token);
    let _ = session.RemoveCompleted(active.completed_token);
    let _ = active.recognizer.Close();

    if let Some(app) = app {
        emit_state(&app, SttState::Idle, None);
    }

    Ok(())
}

pub fn get_status() -> SttStatus {
    let guard = match runtime().lock() {
        Ok(guard) => guard,
        Err(_) => {
            return SttStatus {
                state: SttState::Idle,
                language: None,
            };
        }
    };

    if let Some(session) = &guard.session {
        SttStatus {
            state: SttState::Listening,
            language: Some(session.language.clone()),
        }
    } else {
        SttStatus {
            state: SttState::Idle,
            language: None,
        }
    }
}
