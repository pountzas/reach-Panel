pub(crate) mod events;
mod network;
mod route;

#[cfg(target_os = "windows")]
pub(crate) mod groq;
#[cfg(target_os = "windows")]
mod winrt;
#[cfg(not(target_os = "windows"))]
mod stub;

use route::{can_dictate, prefer_cloud_stt, select_engine, RouteDecision, SttEngine};
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
    /// Active or preferred engine for the current conditions: "winrt" | "groq" | null
    pub engine: Option<String>,
    pub groq_configured: bool,
    pub winrt_supported: bool,
    pub online: bool,
    pub can_dictate: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveBackend {
    WinRt,
    Groq,
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
        SttEngine::Groq => "groq",
    }
}

#[cfg(target_os = "windows")]
pub fn init(_app_data_dir: &std::path::Path, _app: AppHandle) {}

#[cfg(not(target_os = "windows"))]
pub fn init(_app_data_dir: &std::path::Path, _app: AppHandle) {}

pub fn start_dictation(
    language: &str,
    groq_api_key: Option<&str>,
    app: AppHandle,
) -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let online = network::is_online();
        let winrt_supported = winrt::is_language_supported(language);
        let groq_configured = groq::is_configured(groq_api_key);
        let prefer_cloud = prefer_cloud_stt(language);
        match select_engine(online, winrt_supported, groq_configured, prefer_cloud) {
            RouteDecision::Use(SttEngine::WinRt) => {
                winrt::start_dictation(language, app)?;
                if let Ok(mut guard) = router().lock() {
                    guard.active = Some(ActiveBackend::WinRt);
                }
                Ok(())
            }
            RouteDecision::Use(SttEngine::Groq) => {
                let key = groq::resolve_api_key(groq_api_key).ok_or_else(|| {
                    anyhow::anyhow!(
                        "GROQ_KEY: Add a free Groq API key in Settings to dictate in this language."
                    )
                })?;
                groq::start_dictation(language, &key, app)?;
                if let Ok(mut guard) = router().lock() {
                    guard.active = Some(ActiveBackend::Groq);
                }
                Ok(())
            }
            RouteDecision::Unavailable => {
                if !online {
                    anyhow::bail!(
                        "GROQ_API: Dictation requires an internet connection."
                    );
                }
                if prefer_cloud || !winrt_supported {
                    anyhow::bail!(
                        "GROQ_KEY: Windows speech recognition does not support this language. Add a free Groq API key in Settings to dictate."
                    );
                }
                anyhow::bail!("Dictation is unavailable right now.");
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = groq_api_key;
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
            Some(ActiveBackend::Groq) => {
                groq::stop_dictation()?;
            }
            None => {
                let _ = winrt::stop_dictation();
                let _ = groq::stop_dictation();
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

pub fn get_status(language: Option<&str>, groq_api_key: Option<&str>) -> SttStatus {
    #[cfg(target_os = "windows")]
    {
        let online = network::is_online();
        let lang = language.unwrap_or("en");
        let winrt_supported = winrt::is_language_supported(lang);
        let groq_configured = groq::is_configured(groq_api_key);
        let prefer_cloud = prefer_cloud_stt(lang);
        let preferred = select_engine(online, winrt_supported, groq_configured, prefer_cloud);
        let engine = match preferred {
            RouteDecision::Use(e) => Some(engine_name(e).to_string()),
            RouteDecision::Unavailable => None,
        };

        let (state, active_language) = if groq::is_active() {
            let state = if groq::is_processing() {
                SttState::Processing
            } else {
                SttState::Listening
            };
            (state, groq::active_language())
        } else {
            let status = winrt::get_status();
            (status.state, status.language)
        };

        let engine = match router().lock().ok().and_then(|g| g.active) {
            Some(ActiveBackend::WinRt) => Some("winrt".to_string()),
            Some(ActiveBackend::Groq) => Some("groq".to_string()),
            None => engine,
        };

        SttStatus {
            state,
            language: active_language,
            engine,
            groq_configured,
            winrt_supported,
            online,
            can_dictate: can_dictate(online, winrt_supported, groq_configured, prefer_cloud),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = language;
        let _ = groq_api_key;
        let status = stub::get_status();
        SttStatus {
            state: status.state,
            language: status.language,
            engine: None,
            groq_configured: false,
            winrt_supported: false,
            online: network::is_online(),
            can_dictate: false,
        }
    }
}
