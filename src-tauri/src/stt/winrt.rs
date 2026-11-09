use super::events::{emit_error, emit_state, handle_desktop_result, map_stt_error};
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
    SpeechRecognitionScenario, SpeechRecognitionTopicConstraint, SpeechRecognizer,
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
    starting: bool,
    stopping: bool,
    generation: u64,
    success_results: u32,
}

impl Default for DictationRuntime {
    fn default() -> Self {
        Self {
            session: None,
            app_handle: None,
            starting: false,
            stopping: false,
            generation: 0,
            success_results: 0,
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

/// Silence / pause timeouts and user cancel are normal ends, not errors.
fn is_quiet_end(status: SpeechRecognitionResultStatus) -> bool {
    status == SpeechRecognitionResultStatus::TimeoutExceeded
        || status == SpeechRecognitionResultStatus::PauseLimitExceeded
        || status == SpeechRecognitionResultStatus::UserCanceled
}

/// Session present, start in flight, or CancelAsync still running all block a new start.
fn runtime_is_busy(has_session: bool, starting: bool, stopping: bool) -> bool {
    has_session || starting || stopping
}

/// What stop_dictation must do after attempting ContinuousRecognitionSession / CancelAsync.
struct StopCleanupActions {
    remove_event_tokens: bool,
    close_recognizer: bool,
    emit_idle: bool,
}

/// Token removal needs a session; Close + Idle always run even when session lookup fails.
fn stop_cleanup_actions(got_recognition_session: bool) -> StopCleanupActions {
    StopCleanupActions {
        remove_event_tokens: got_recognition_session,
        close_recognizer: true,
        emit_idle: true,
    }
}

/// Completed handlers must ignore events from a previous recognizer session.
fn is_current_session(current: u64, event: u64) -> bool {
    current == event
}

pub fn is_active() -> bool {
    runtime()
        .lock()
        .map(|g| runtime_is_busy(g.session.is_some(), g.starting, g.stopping))
        .unwrap_or(false)
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

pub(crate) fn dictation_topic_name() -> &'static str {
    "Dictation"
}

pub const NO_SPEECH_RECOGNIZED: &str =
    "No speech recognized. Check the microphone and speak after dictation starts.";

pub(crate) fn silence_without_results_message(
    status_is_timeout_or_pause: bool,
    success_result_count: u32,
) -> Option<&'static str> {
    if status_is_timeout_or_pause && success_result_count == 0 {
        Some(NO_SPEECH_RECOGNIZED)
    } else {
        None
    }
}

struct StartingFlagGuard;

impl Drop for StartingFlagGuard {
    fn drop(&mut self) {
        if let Ok(mut guard) = runtime().lock() {
            guard.starting = false;
        }
    }
}

struct StoppingFlagGuard;

impl Drop for StoppingFlagGuard {
    fn drop(&mut self) {
        if let Ok(mut guard) = runtime().lock() {
            guard.stopping = false;
        }
    }
}

pub fn start_dictation(language: &str, app: AppHandle) -> Result<()> {
    ensure_winrt()?;

    let tag = winrt_language_tag(language);
    require_language_supported(tag)?;

    let my_gen = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Dictation runtime lock poisoned"))?;
        if runtime_is_busy(guard.session.is_some(), guard.starting, guard.stopping) {
            return Err(anyhow!("Dictation is already active"));
        }
        guard.starting = true;
        guard.generation = guard.generation.wrapping_add(1);
        guard.success_results = 0;
        guard.generation
    };
    let _starting_guard = StartingFlagGuard;

    // Build recognizer and await WinRT ops without holding the global mutex.
    let win_lang = Language::CreateLanguage(&HSTRING::from(tag))?;
    let recognizer = SpeechRecognizer::Create(&win_lang)?;

    let constraint = SpeechRecognitionTopicConstraint::Create(
        SpeechRecognitionScenario::Dictation,
        &HSTRING::from(dictation_topic_name()),
    )?;
    recognizer.Constraints()?.Append(&constraint)?;

    let compile = recognizer.CompileConstraintsAsync()?;
    let compilation = compile
        .get()
        .map_err(|e| anyhow!("Failed to compile speech constraints: {e}"))?;
    if compilation.Status()? != SpeechRecognitionResultStatus::Success {
        let _ = recognizer.Close();
        return Err(anyhow!(
            "Speech recognition constraints failed to compile for '{tag}'"
        ));
    }

    let session = recognizer.ContinuousRecognitionSession()?;
    let timeouts = recognizer.Timeouts()?;
    let configured = super::timeouts::winrt_silence_timeouts();
    timeouts.SetInitialSilenceTimeout(configured.initial)?;
    timeouts.SetEndSilenceTimeout(configured.end)?;
    session.SetAutoStopSilenceTimeout(configured.auto_stop)?;

    let app_for_results = app.clone();
    let result_token = session.ResultGenerated(&TypedEventHandler::new(
        move |_sender, args: &Option<SpeechContinuousRecognitionResultGeneratedEventArgs>| {
            let Some(args) = args else {
                return Ok(());
            };
            let Ok(result) = args.Result() else {
                return Ok(());
            };
            let status = result.Status()?;
            if status != SpeechRecognitionResultStatus::Success {
                log::warn!("winrt ResultGenerated status={status:?}");
                return Ok(());
            }
            if let Ok(mut g) = runtime().lock() {
                if is_current_session(g.generation, my_gen) {
                    g.success_results = g.success_results.saturating_add(1);
                }
            }
            let text = result.Text()?.to_string();
            log::info!("winrt ResultGenerated chars={}", text.chars().count());
            handle_desktop_result(&app_for_results, &text);
            Ok(())
        },
    ))?;

    let app_for_completed = app.clone();
    let completed_token = session.Completed(&TypedEventHandler::new(
        move |_sender, args: &Option<SpeechContinuousRecognitionCompletedEventArgs>| {
            let (ended, success_result_count) = match runtime().lock() {
                Ok(mut g) if is_current_session(g.generation, my_gen) => {
                    let count = g.success_results;
                    g.success_results = 0;
                    (g.session.take(), count)
                }
                Ok(_) => return Ok(()),
                Err(_) => (None, 0),
            };
            if let Some(active) = ended {
                // Close outside this callback to avoid deadlocking WinRT.
                std::thread::spawn(move || {
                    let _ = ensure_winrt();
                    if let Ok(s) = active.recognizer.ContinuousRecognitionSession() {
                        let _ = s.RemoveResultGenerated(active.result_token);
                        let _ = s.RemoveCompleted(active.completed_token);
                    }
                    let _ = active.recognizer.Close();
                });
            }

            let still_current = runtime()
                .lock()
                .ok()
                .is_some_and(|g| is_current_session(g.generation, my_gen));
            if !still_current {
                return Ok(());
            }
            super::clear_active_backend(super::ActiveBackend::WinRt);
            if let Some(args) = args {
                if let Ok(status) = args.Status() {
                    if success_result_count == 0 {
                        log::info!(
                            "{}",
                            super::log_lines::result_log_line("winrt", &format!("{status:?}"), 0,)
                        );
                    } else {
                        log::info!("winrt Completed status={status:?}");
                    }
                    if status != SpeechRecognitionResultStatus::Success && !is_quiet_end(status) {
                        emit_error(
                            &app_for_completed,
                            format!("Dictation ended with status: {status:?}"),
                        );
                    } else if let Some(message) = silence_without_results_message(
                        status == SpeechRecognitionResultStatus::TimeoutExceeded
                            || status == SpeechRecognitionResultStatus::PauseLimitExceeded,
                        success_result_count,
                    ) {
                        emit_error(&app_for_completed, message);
                    }
                }
            }
            emit_state(&app_for_completed, SttState::Idle, None);
            Ok(())
        },
    ))?;

    let start = session.StartAsync()?;
    if let Err(e) = start.get() {
        let _ = session.RemoveResultGenerated(result_token);
        let _ = session.RemoveCompleted(completed_token);
        let _ = recognizer.Close();
        return Err(map_stt_error(format!("Failed to start dictation: {e}")));
    }

    let mut guard = runtime()
        .lock()
        .map_err(|_| anyhow!("Dictation runtime lock poisoned"))?;
    if guard.session.is_some() {
        drop(guard);
        let _ = session.StopAsync().and_then(|op| op.get());
        let _ = session.RemoveResultGenerated(result_token);
        let _ = session.RemoveCompleted(completed_token);
        let _ = recognizer.Close();
        return Err(anyhow!("Dictation is already active"));
    }

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
    let (active, app) = {
        let mut guard = runtime()
            .lock()
            .map_err(|_| anyhow!("Dictation runtime lock poisoned"))?;
        let active = match guard.session.take() {
            Some(active) => active,
            None => return Ok(()),
        };
        guard.stopping = true;
        let app = guard.app_handle.clone();
        (active, app)
    };
    let _stopping_guard = StoppingFlagGuard;

    // Await CancelAsync without holding the global mutex (bounded; always Close + Idle).
    let session = match active.recognizer.ContinuousRecognitionSession() {
        Ok(session) => Some(session),
        Err(e) => {
            log::error!(
                "stt stop session lookup failed engine=winrt err={}",
                crate::logging::redact(&e.to_string())
            );
            None
        }
    };

    if let Some(ref session) = session {
        match session.CancelAsync() {
            Ok(stop) => {
                let started = std::time::Instant::now();
                let (tx, rx) = std::sync::mpsc::channel();
                std::thread::spawn(move || {
                    let _ = tx.send(stop.get());
                });
                match rx.recv_timeout(super::timeouts::STOP_ASYNC) {
                    Ok(Ok(())) => {
                        log::info!(
                            "stt stop completed engine=winrt duration_ms={}",
                            started.elapsed().as_millis()
                        );
                    }
                    Ok(Err(e)) => {
                        log::error!(
                            "stt stop failed engine=winrt err={}",
                            crate::logging::redact(&e.to_string())
                        );
                    }
                    Err(_) => {
                        log::error!(
                            "stt stop timed out engine=winrt duration_ms={}",
                            started.elapsed().as_millis()
                        );
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "stt stop CancelAsync failed engine=winrt err={}",
                    crate::logging::redact(&e.to_string())
                );
            }
        }
    }

    let cleanup = stop_cleanup_actions(session.is_some());
    if cleanup.remove_event_tokens {
        if let Some(session) = session {
            let _ = session.RemoveResultGenerated(active.result_token);
            let _ = session.RemoveCompleted(active.completed_token);
        }
    }
    if cleanup.close_recognizer {
        let _ = active.recognizer.Close();
    }
    if cleanup.emit_idle {
        if let Some(app) = app {
            emit_state(&app, SttState::Idle, None);
        }
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
                groq_configured: false,
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
            groq_configured: false,
            winrt_supported: true,
            online: true,
            can_dictate: true,
        }
    } else {
        SttStatus {
            state: SttState::Idle,
            language: None,
            engine: None,
            groq_configured: false,
            winrt_supported: false,
            online: false,
            can_dictate: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quiet_end_includes_timeout_pause_and_cancel() {
        assert!(is_quiet_end(SpeechRecognitionResultStatus::TimeoutExceeded));
        assert!(is_quiet_end(
            SpeechRecognitionResultStatus::PauseLimitExceeded
        ));
        assert!(is_quiet_end(SpeechRecognitionResultStatus::UserCanceled));
    }

    #[test]
    fn quiet_end_excludes_success_and_real_failures() {
        assert!(!is_quiet_end(SpeechRecognitionResultStatus::Success));
        assert!(!is_quiet_end(SpeechRecognitionResultStatus::NetworkFailure));
        assert!(!is_quiet_end(
            SpeechRecognitionResultStatus::MicrophoneUnavailable
        ));
        assert!(!is_quiet_end(
            SpeechRecognitionResultStatus::AudioQualityFailure
        ));
    }

    #[test]
    fn runtime_busy_while_stopping() {
        assert!(runtime_is_busy(false, false, true));
        assert!(runtime_is_busy(true, false, false));
        assert!(runtime_is_busy(false, true, false));
        assert!(!runtime_is_busy(false, false, false));
    }

    #[test]
    fn stop_cleanup_always_closes_and_emits_idle() {
        let with_session = stop_cleanup_actions(true);
        assert!(with_session.remove_event_tokens);
        assert!(with_session.close_recognizer);
        assert!(with_session.emit_idle);

        let without_session = stop_cleanup_actions(false);
        assert!(!without_session.remove_event_tokens);
        assert!(without_session.close_recognizer);
        assert!(without_session.emit_idle);
    }

    #[test]
    fn completed_ignores_older_session_generation() {
        assert!(is_current_session(5, 5));
        assert!(!is_current_session(6, 5));
        assert!(!is_current_session(0, 1));
    }

    #[test]
    fn dictation_topic_name_is_dictation() {
        assert_eq!(dictation_topic_name(), "Dictation");
    }

    #[test]
    fn silence_without_results_message_on_timeout_with_zero_results() {
        assert_eq!(
            silence_without_results_message(true, 0),
            Some("No speech recognized. Check the microphone and speak after dictation starts.")
        );
    }

    #[test]
    fn silence_without_results_message_none_when_timeout_has_a_result() {
        assert_eq!(silence_without_results_message(true, 1), None);
    }

    #[test]
    fn silence_without_results_message_none_on_cancel_with_zero_results() {
        assert_eq!(silence_without_results_message(false, 0), None);
    }
}
