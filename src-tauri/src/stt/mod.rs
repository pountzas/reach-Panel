#[cfg(target_os = "windows")]
mod winrt;
#[cfg(not(target_os = "windows"))]
mod stub;

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SttState {
    Idle,
    Listening,
    Processing,
}

#[derive(Debug, Clone, Serialize)]
pub struct SttStatus {
    pub state: SttState,
    pub language: Option<String>,
}

#[cfg(target_os = "windows")]
pub use winrt::{get_status, start_dictation, stop_dictation};

#[cfg(not(target_os = "windows"))]
pub use stub::{get_status, start_dictation, stop_dictation};
