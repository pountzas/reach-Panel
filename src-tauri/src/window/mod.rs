use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct WindowLayout {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

const COLLAPSED_BAR_HEIGHT: u32 = 48;
pub const COLLAPSE_ANIMATION_MS: u64 = 400;
pub const COLLAPSE_ANIMATION_FRAME_MS: u64 = 60;

fn ease_out_cubic(t: f32) -> f32 {
    1.0 - (1.0 - t).powi(3)
}

fn lerp_i32(from: i32, to: i32, t: f32) -> i32 {
    from + ((to - from) as f32 * t).round() as i32
}

fn lerp_u32(from: u32, to: u32, t: f32) -> u32 {
    (from as f32 + (to as f32 - from as f32) * t).round() as u32
}

pub fn interpolate_layout(from: WindowLayout, to: WindowLayout, progress: f32) -> WindowLayout {
    let t = ease_out_cubic(progress.clamp(0.0, 1.0));
    WindowLayout {
        x: lerp_i32(from.x, to.x, t),
        y: lerp_i32(from.y, to.y, t),
        width: lerp_u32(from.width, to.width, t),
        height: lerp_u32(from.height, to.height, t),
    }
}

pub fn compute_window_layout(
    monitors: &[MonitorInfo],
    monitor_id: u32,
    collapsed: bool,
) -> Result<WindowLayout, String> {
    let monitor = monitors
        .iter()
        .find(|m| m.id == monitor_id)
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .ok_or_else(|| "No monitor found".to_string())?;

    let (x, mut y, w, mut h) = if monitors.len() >= 2 {
        (
            monitor.x,
            monitor.y,
            monitor.width as u32,
            monitor.height as u32,
        )
    } else {
        (
            monitor.x,
            monitor.y + monitor.height / 2,
            monitor.width as u32,
            (monitor.height / 2) as u32,
        )
    };

    if collapsed {
        y += h as i32 - COLLAPSED_BAR_HEIGHT as i32;
        h = COLLAPSED_BAR_HEIGHT;
    }

    Ok(WindowLayout {
        x,
        y,
        width: w,
        height: h,
    })
}

#[cfg(target_os = "windows")]
mod windows;
#[cfg(not(target_os = "windows"))]
mod stub;

#[cfg(target_os = "windows")]
pub use windows::{get_window_bounds, list_monitors, set_window_bounds};
#[cfg(not(target_os = "windows"))]
pub use stub::list_monitors;
