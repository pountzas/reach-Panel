mod events;
mod network;
mod route;

#[cfg(target_os = "windows")]
mod whisper;
#[cfg(target_os = "windows")]
mod winrt;
#[cfg(not(target_os = "windows"))]
mod stub;

use route::{can_dictate, select_engine, RouteDecision, SttEngine};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SttState {
    Idle,
    Listening,
    Processing,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttStatus {
    pub state: SttState,
    pub language: Option<String>,
    /// Active or preferred engine for the current conditions: "winrt" | "whisper" | null
    pub engine: Option<String>,
    pub whisper_ready: bool,
    pub whisper_downloading: bool,
    pub winrt_supported: bool,
    pub online: bool,
    pub can_dictate: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperDownloadEvent {
    pub progress: f64,
    pub ready: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveBackend {
    WinRt,
    Whisper,
}

struct RouterState {
    active: Option<ActiveBackend>,
}

static ROUTER: OnceLock<Mutex<RouterState>> = OnceLock::new();

fn router() -> &'static Mutex<RouterState> {
    ROUTER.get_or_init(|| Mutex::new(RouterState { active: None }))
}

fn engine_name(engine: SttEngine) -> &'static str {
    match engine {
        SttEngine::WinRt => "winrt",
        SttEngine::Whisper => "whisper",
    }
}

#[cfg(target_os = "windows")]
pub fn init(app_data_dir: &std::path::Path, app: AppHandle) {
    let model_dir = app_data_dir.join("whisper");
    whisper::init(model_dir);
    // Kick off model download in the background so Greek/offline work when ready.
    std::thread::spawn(move || {
        let _ = whisper::ensure_model(app);
    });
}

#[cfg(not(target_os = "windows"))]
pub fn init(_app_data_dir: &std::path::Path, _app: AppHandle) {}

#[cfg(target_os = "windows")]
pub fn ensure_whisper_model(app: AppHandle) -> anyhow::Result<()> {
    whisper::ensure_model(app)
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_whisper_model(_app: AppHandle) -> anyhow::Result<()> {
    anyhow::bail!("Whisper is only available on Windows in this build")
}

pub fn start_dictation(language: &str, app: AppHandle) -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let online = network::is_online();
        let winrt_supported = winrt::is_language_supported(language);
        let whisper_ready = whisper::is_ready();
        match select_engine(online, winrt_supported, whisper_ready) {
            RouteDecision::Use(SttEngine::WinRt) => {
                winrt::start_dictation(language, app)?;
                if let Ok(mut guard) = router().lock() {
                    guard.active = Some(ActiveBackend::WinRt);
                }
                Ok(())
            }
            RouteDecision::Use(SttEngine::Whisper) => {
                whisper::start_dictation(language, app)?;
                if let Ok(mut guard) = router().lock() {
                    guard.active = Some(ActiveBackend::Whisper);
                }
                Ok(())
            }
            RouteDecision::Unavailable => {
                if !winrt_supported {
                    anyhow::bail!(
                        "WHISPER_MODEL: Windows speech recognition does not support this language. Download the local speech model to dictate."
                    );
                }
                anyhow::bail!(
                    "WHISPER_MODEL: Local speech model is not ready yet. Download it to dictate while offline."
                );
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        stub::start_dictation(language, app)
    }
}

pub fn stop_dictation() -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let active = router().lock().ok().and_then(|g| g.active);
        match active {
            Some(ActiveBackend::WinRt) => {
                winrt::stop_dictation()?;
            }
            Some(ActiveBackend::Whisper) => {
                whisper::stop_dictation()?;
            }
            None => {
                // Best-effort cleanup if state was lost.
                let _ = winrt::stop_dictation();
                let _ = whisper::stop_dictation();
            }
        }
        if let Ok(mut guard) = router().lock() {
            guard.active = None;
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        stub::stop_dictation()
    }
}

pub fn get_status(language: Option<&str>) -> SttStatus {
    #[cfg(target_os = "windows")]
    {
        let online = network::is_online();
        let lang = language.unwrap_or("en");
        let winrt_supported = winrt::is_language_supported(lang);
        let whisper_ready = whisper::is_ready();
        let whisper_downloading = whisper::is_downloading();
        let preferred = select_engine(online, winrt_supported, whisper_ready);
        let engine = match preferred {
            RouteDecision::Use(e) => Some(engine_name(e).to_string()),
            RouteDecision::Unavailable => None,
        };

        let (state, active_language) = if whisper::is_active() {
            (
                SttState::Listening,
                whisper::active_language(),
            )
        } else {
            let status = winrt::get_status();
            (status.state, status.language)
        };

        // If actively listening, report the engine in use.
        let engine = match router().lock().ok().and_then(|g| g.active) {
            Some(ActiveBackend::WinRt) => Some("winrt".to_string()),
            Some(ActiveBackend::Whisper) => Some("whisper".to_string()),
            None => engine,
        };

        SttStatus {
            state,
            language: active_language,
            engine,
            whisper_ready,
            whisper_downloading,
            winrt_supported,
            online,
            can_dictate: can_dictate(online, winrt_supported, whisper_ready),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = language;
        let status = stub::get_status();
        SttStatus {
            state: status.state,
            language: status.language,
            engine: None,
            whisper_ready: false,
            whisper_downloading: false,
            winrt_supported: false,
            online: network::is_online(),
            can_dictate: false,
        }
    }
}

