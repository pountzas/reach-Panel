//! Taskbar detection (auto-hide lift) and position automation.

mod detect;
mod position;

#[cfg(test)]
mod tests;

pub use detect::set_window_bounds_with_taskbar_lift;
pub use position::{
    apply_taskbar_position_from_str, get_taskbar_position_for_monitor, TaskbarPosition,
    TaskbarPositionResult,
};
