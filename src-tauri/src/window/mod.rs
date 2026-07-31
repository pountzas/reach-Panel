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

const COLLAPSED_SIZE: u32 = 56;
const COLLAPSED_MARGIN: u32 = 16;
/// Transparent padding around FABs so shadow + hover:scale-105 are not clipped.
/// Keep in sync with FAB_PAD in CollapsedFab.tsx.
const COLLAPSED_PAD: u32 = 10;
/// Gap between stacked collapsed FABs (expand + dictation).
const COLLAPSED_FAB_GAP: u32 = 12;
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
    collapsed_dictation: bool,
    height_ratio: f32,
) -> Result<WindowLayout, String> {
    let monitor = monitors
        .iter()
        .find(|m| m.id == monitor_id)
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .ok_or_else(|| "No monitor found".to_string())?;

    let (mut x, mut y, mut w, mut h) = if monitors.len() >= 2 {
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
        // FAB stays bottom-right of the full region; ignore content height_ratio.
        let fab_stack_h = if collapsed_dictation {
            COLLAPSED_SIZE * 2 + COLLAPSED_FAB_GAP
        } else {
            COLLAPSED_SIZE
        };
        let collapsed_w = COLLAPSED_SIZE + 2 * COLLAPSED_PAD;
        let collapsed_h = fab_stack_h + 2 * COLLAPSED_PAD;
        x += w as i32 - collapsed_w as i32 - COLLAPSED_MARGIN as i32;
        y += h as i32 - collapsed_h as i32 - COLLAPSED_MARGIN as i32;
        w = collapsed_w;
        h = collapsed_h;
    } else {
        let ratio = height_ratio.clamp(0.05, 1.0);
        let region_y = y;
        let region_h = h;
        h = ((region_h as f32) * ratio).round().max(1.0) as u32;
        y = region_y + region_h as i32 - h as i32;
    }

    Ok(WindowLayout {
        x,
        y,
        width: w,
        height: h,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_monitor(id: u32, x: i32, y: i32, w: i32, h: i32) -> MonitorInfo {
        MonitorInfo {
            id,
            name: format!("Monitor {id}"),
            x,
            y,
            width: w,
            height: h,
            is_primary: id == 0,
        }
    }

    #[test]
    fn collapsed_single_monitor_bottom_right() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(&monitors, 0, true, false, 0.5).unwrap();
        let expected_w = COLLAPSED_SIZE + 2 * COLLAPSED_PAD;
        let expected_h = COLLAPSED_SIZE + 2 * COLLAPSED_PAD;

        assert_eq!(layout.width, expected_w);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.x, 1920 - expected_w as i32 - 16);
        assert_eq!(layout.y, 540 + 540 - expected_h as i32 - 16);
    }

    #[test]
    fn collapsed_with_dictation_is_taller() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(&monitors, 0, true, true, 1.0).unwrap();
        let expected_w = COLLAPSED_SIZE + 2 * COLLAPSED_PAD;
        let expected_h = COLLAPSED_SIZE * 2 + COLLAPSED_FAB_GAP + 2 * COLLAPSED_PAD;

        assert_eq!(layout.width, expected_w);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.x, 1920 - expected_w as i32 - 16);
        assert_eq!(layout.y, 540 + 540 - expected_h as i32 - 16);
    }

    #[test]
    fn collapsed_multi_monitor_bottom_right() {
        let monitors = vec![
            sample_monitor(0, 0, 0, 1920, 1080),
            sample_monitor(1, 1920, 0, 1920, 1080),
        ];
        let layout = compute_window_layout(&monitors, 1, true, false, 1.0).unwrap();
        let expected_w = COLLAPSED_SIZE + 2 * COLLAPSED_PAD;
        let expected_h = COLLAPSED_SIZE + 2 * COLLAPSED_PAD;

        assert_eq!(layout.width, expected_w);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.x, 1920 + 1920 - expected_w as i32 - 16);
        assert_eq!(layout.y, 1080 - expected_h as i32 - 16);
    }

    #[test]
    fn expanded_full_ratio_fills_single_monitor_region() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(&monitors, 0, false, false, 1.0).unwrap();

        assert_eq!(layout.x, 0);
        assert_eq!(layout.y, 540);
        assert_eq!(layout.width, 1920);
        assert_eq!(layout.height, 540);
    }

    #[test]
    fn expanded_partial_ratio_bottom_aligned_single_monitor() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(&monitors, 0, false, false, 0.5).unwrap();

        assert_eq!(layout.width, 1920);
        assert_eq!(layout.height, 270);
        assert_eq!(layout.x, 0);
        // Bottom of window stays at region bottom (1080).
        assert_eq!(layout.y + layout.height as i32, 1080);
        assert_eq!(layout.y, 810);
    }

    #[test]
    fn expanded_partial_ratio_bottom_aligned_multi_monitor() {
        let monitors = vec![
            sample_monitor(0, 0, 0, 1920, 1080),
            sample_monitor(1, 1920, 0, 1920, 1080),
        ];
        let layout = compute_window_layout(&monitors, 1, false, false, 0.61).unwrap();

        let expected_h = ((1080.0_f32) * 0.61).round() as u32;
        assert_eq!(layout.x, 1920);
        assert_eq!(layout.width, 1920);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.y + layout.height as i32, 1080);
    }
}

#[cfg(target_os = "windows")]
mod windows;
#[cfg(not(target_os = "windows"))]
mod stub;

#[cfg(target_os = "windows")]
pub use windows::{get_window_bounds, list_monitors, set_window_bounds};
#[cfg(not(target_os = "windows"))]
pub use stub::list_monitors;
