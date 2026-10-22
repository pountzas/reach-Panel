//! Platform keyboard/mouse injection and focus tracking (Windows).

mod cursor_highlight;
pub mod focus_target;
pub mod input_preview;
mod keyboard;
mod mouse;
mod wgc_capture;

pub use keyboard::*;
pub use mouse::*;
