//! Speech-to-text helpers (companion Groq path; PC dictation uses Win+H).

pub(crate) mod events;
pub(crate) mod groq;
mod route;

use tauri::AppHandle;

pub fn init(_app_data_dir: &std::path::Path, _app: AppHandle) {}
