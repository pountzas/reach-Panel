//! Platform keyboard/mouse injection and focus tracking (Windows).

mod cursor_highlight;
pub mod focus_target;
pub mod input_preview;
mod keyboard;
mod mouse;
mod pc_mic;
mod voice_typing;

pub use pc_mic::{
    launch_pc_mic_tap, pc_mic_config_from_settings, pc_mic_hold_down, pc_mic_hold_up, PcMicConfig,
};
mod wgc_capture;

pub use keyboard::*;
pub use mouse::*;
