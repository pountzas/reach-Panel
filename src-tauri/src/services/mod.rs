//! Shared host-side operations used by Tauri IPC commands and the companion bridge.

mod profile_snapshot;

pub use profile_snapshot::build_profile_snapshot;
