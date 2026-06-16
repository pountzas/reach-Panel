#[cfg(target_os = "windows")]
pub mod focus_target;
#[cfg(target_os = "windows")]
mod keyboard;
#[cfg(target_os = "windows")]
mod mouse;
#[cfg(not(target_os = "windows"))]
mod stub;

#[cfg(target_os = "windows")]
pub use keyboard::*;
#[cfg(target_os = "windows")]
pub use mouse::*;
#[cfg(not(target_os = "windows"))]
pub use stub::*;
