//! Shared host-side operations used by Tauri IPC commands and the companion bridge.

mod phrases;
mod profile_snapshot;
mod quick_actions;

pub use phrases::type_phrase_text;
pub use profile_snapshot::build_profile_snapshot;
pub use quick_actions::launch_quick_action;
