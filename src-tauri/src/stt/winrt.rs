use super::events::{emit_error, emit_state, handle_result, map_stt_error};
use super::route::winrt_language_tag;
use super::{SttState, SttStatus};
use anyhow::{anyhow, Result};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use windows::core::HSTRING;
use windows::Foundation::{EventRegistrationToken, TypedEventHandler};
use windows::Globalization::Language;
use windows::Media::SpeechRecognition::{
    SpeechContinuousRecognitionCompletedEventArgs,
    SpeechContinuousRecognitionResultGeneratedEventArgs, SpeechRecognitionResultStatus,
    SpeechRecognizer,
};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

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

pub fn is_language_supported(language: &str) -> bool {
    if ensure_winrt().is_err() {
        return false;
    }
    let tag = winrt_language_tag(language);
    language_in_supported_topics(tag).unwrap_or(false)
}

fn language_in_supported_topics(tag: &str) -> Result<bool> {
    let supported = SpeechRecognizer::SupportedTopicLanguages()?;
    let size = supported.Size()?;
    for i in 0..size {
        let lang = supported.GetAt(i)?;
        if lang.LanguageTag()?.to_string().eq_ignore_ascii_case(tag) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn require_language_supported(tag: &str) -> Result<()> {
    if language_in_supported_topics(tag)? {
        return Ok(());
    }
    Err(anyhow!(
        "SPEECH_LANGUAGE: No speech recognition language found for '{tag}'. Install the speech pack in Windows Settings → Time & language → Speech (or Language & region), then try again."
    ))
}

pub fn start_dictation(language: &str, app: AppHandle) -> Result<()> {
    ensure_winrt()?;

    let tag = winrt_language_tag(language);
    require_language_supported(tag)?;

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
    if compilation.Status()? != SpeechRecognitionResultStatus::Success {
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
                engine: None,
                whisper_ready: false,
                whisper_downloading: false,
                winrt_supported: false,
                online: false,
                can_dictate: false,
            };
        }
    };

    if let Some(session) = &guard.session {
        SttStatus {
            state: SttState::Listening,
            language: Some(session.language.clone()),
            engine: Some("winrt".to_string()),
            whisper_ready: false,
            whisper_downloading: false,
            winrt_supported: true,
            online: true,
            can_dictate: true,
        }
    } else {
        SttStatus {
            state: SttState::Idle,
            language: None,
            engine: None,
            whisper_ready: false,
            whisper_downloading: false,
            winrt_supported: false,
            online: false,
            can_dictate: false,
        }
    }
}
