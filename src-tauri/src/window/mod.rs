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
    /// True when this monitor's work area overlaps another by ≥90% (mirrored duplicate).
    pub is_mirror_duplicate: bool,
    /// Effective DPI scale (96 DPI = 1.0). Used to convert physical work-area coords to logical.
    pub scale_factor: f64,
}

/// Fraction of the smaller monitor area that must overlap to count as mirrored.
pub const MIRROR_OVERLAP_RATIO: f64 = 0.9;

fn monitor_area(m: &MonitorInfo) -> i64 {
    (m.width.max(0) as i64) * (m.height.max(0) as i64)
}

fn intersection_area(a: &MonitorInfo, b: &MonitorInfo) -> i64 {
    let ax2 = a.x.saturating_add(a.width);
    let ay2 = a.y.saturating_add(a.height);
    let bx2 = b.x.saturating_add(b.width);
    let by2 = b.y.saturating_add(b.height);
    let ix1 = a.x.max(b.x);
    let iy1 = a.y.max(b.y);
    let ix2 = ax2.min(bx2);
    let iy2 = ay2.min(by2);
    if ix2 > ix1 && iy2 > iy1 {
        (ix2 - ix1) as i64 * (iy2 - iy1) as i64
    } else {
        0
    }
}

/// True when work areas overlap by ≥90% of the smaller monitor area.
pub fn monitors_overlap(a: &MonitorInfo, b: &MonitorInfo) -> bool {
    let smaller = monitor_area(a).min(monitor_area(b));
    if smaller <= 0 {
        return false;
    }
    (intersection_area(a, b) as f64) / (smaller as f64) >= MIRROR_OVERLAP_RATIO
}

/// Mark monitors that significantly overlap another as mirror duplicates.
pub fn mark_mirror_duplicates(monitors: &mut [MonitorInfo]) {
    let n = monitors.len();
    for i in 0..n {
        for j in (i + 1)..n {
            if monitors_overlap(&monitors[i], &monitors[j]) {
                monitors[i].is_mirror_duplicate = true;
                monitors[j].is_mirror_duplicate = true;
            }
        }
    }
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
/// Transparent padding around FABs so shadow + hover scale are not clipped.
/// Keep in sync with COLLAPSED_FAB_PAD in src/lib/miniMode.ts / CollapsedFab.tsx.
const COLLAPSED_PAD: u32 = 10;
/// Gap between stacked collapsed FABs (expand + dictation + settings).
const COLLAPSED_FAB_GAP: u32 = 12;
/// Extra px for hover scale headroom (~5% of 56px). Keep in sync with FAB_HOVER_SLACK in miniMode.ts.
pub const FAB_HOVER_SLACK: u32 = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollapsedFabCount {
    One,
    Two,
    Three,
}

fn collapsed_dpi_scale(dpi_scale: f32) -> f32 {
    dpi_scale.max(1.0)
}

fn scale_collapsed_px(value: u32, dpi_scale: f32) -> u32 {
    (value as f32 * collapsed_dpi_scale(dpi_scale)).ceil() as u32
}

fn collapsed_hover_slack(dpi_scale: f32) -> u32 {
    scale_collapsed_px(FAB_HOVER_SLACK, dpi_scale)
}

fn collapsed_fab_stack_height(count: CollapsedFabCount, dpi_scale: f32) -> u32 {
    let size = scale_collapsed_px(COLLAPSED_SIZE, dpi_scale);
    let gap = scale_collapsed_px(COLLAPSED_FAB_GAP, dpi_scale);
    match count {
        CollapsedFabCount::One => size,
        CollapsedFabCount::Two => size * 2 + gap,
        CollapsedFabCount::Three => size * 3 + gap * 2,
    }
}

/// Collapsed FAB window inner dimensions (width, height) including hover/DPI slack.
pub fn compute_collapsed_dimensions(count: CollapsedFabCount, dpi_scale: f32) -> (u32, u32) {
    let slack = collapsed_hover_slack(dpi_scale);
    let pad = scale_collapsed_px(COLLAPSED_PAD, dpi_scale);
    let size = scale_collapsed_px(COLLAPSED_SIZE, dpi_scale);
    let fab_stack_h = collapsed_fab_stack_height(count, dpi_scale);
    let width = size + 2 * pad + slack;
    let height = fab_stack_h + 2 * pad + slack;
    (width, height)
}

fn collapsed_fab_count(
    collapsed_dictation: bool,
    collapsed_settings: bool,
) -> CollapsedFabCount {
    match (collapsed_settings, collapsed_dictation) {
        (true, true) => CollapsedFabCount::Three,
        (true, false) | (false, true) => CollapsedFabCount::Two,
        (false, false) => CollapsedFabCount::One,
    }
}

pub const COLLAPSE_ANIMATION_MS: u64 = 400;
/// Slide show/hide duration for mini-mode keyboard.
pub const MINI_MODE_ANIMATION_MS: u64 = 300;
pub const COLLAPSE_ANIMATION_FRAME_MS: u64 = 60;
/// Default height as a fraction of full monitor height for mini-mode keyboard.
pub const MINI_KEYBOARD_HEIGHT_RATIO: f32 = 0.42;

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
    collapsed_settings: bool,
    height_ratio: f32,
    mini_mode: bool,
    mini_keyboard_visible: bool,
    mini_keyboard_height_ratio: f32,
    dpi_scale: f32,
) -> Result<WindowLayout, String> {
    let dpi_scale = dpi_scale.max(1.0);
    let monitor = monitors
        .iter()
        .find(|m| m.id == monitor_id)
        .or_else(|| monitors.iter().find(|m| m.is_primary))
        .ok_or_else(|| "No monitor found".to_string())?;

    // Mini mode always uses the full monitor work area (not single-monitor bottom half).
    if mini_mode {
        if mini_keyboard_visible {
            let ratio = if mini_keyboard_height_ratio > 0.0 {
                mini_keyboard_height_ratio.clamp(0.05, 1.0)
            } else {
                MINI_KEYBOARD_HEIGHT_RATIO
            };
            let height = ((monitor.height as f32) * ratio).round().max(1.0) as u32;
            return Ok(WindowLayout {
                x: monitor.x,
                y: monitor.y + monitor.height - height as i32,
                width: monitor.width as u32,
                height,
            });
        }

        let count = collapsed_fab_count(collapsed_dictation, collapsed_settings);
        let (collapsed_w, collapsed_h) = compute_collapsed_dimensions(count, dpi_scale);
        return Ok(WindowLayout {
            x: monitor.x + monitor.width - collapsed_w as i32 - COLLAPSED_MARGIN as i32,
            y: monitor.y + monitor.height - collapsed_h as i32 - COLLAPSED_MARGIN as i32,
            width: collapsed_w,
            height: collapsed_h,
        });
    }

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
        let count = collapsed_fab_count(collapsed_dictation, collapsed_settings);
        let (collapsed_w, collapsed_h) = compute_collapsed_dimensions(count, dpi_scale);
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
            is_mirror_duplicate: false,
            scale_factor: 1.0,
        }
    }

    #[test]
    fn monitors_overlap_detects_mirrored_work_areas() {
        let a = sample_monitor(0, 0, 0, 1920, 1080);
        let b = sample_monitor(1, 0, 0, 1920, 1080);
        assert!(monitors_overlap(&a, &b));

        let side = sample_monitor(1, 1920, 0, 1920, 1080);
        assert!(!monitors_overlap(&a, &side));
    }

    #[test]
    fn mark_mirror_duplicates_flags_overlapping_pair() {
        let mut monitors = vec![
            sample_monitor(0, 0, 0, 1920, 1080),
            sample_monitor(1, 0, 0, 1920, 1080),
            sample_monitor(2, 1920, 0, 1920, 1080),
        ];
        mark_mirror_duplicates(&mut monitors);
        assert!(monitors[0].is_mirror_duplicate);
        assert!(monitors[1].is_mirror_duplicate);
        assert!(!monitors[2].is_mirror_duplicate);
    }

    #[test]
    fn monitor_for_rect_picks_largest_overlap() {
        let monitors = vec![
            sample_monitor(0, 0, 0, 1920, 1080),
            sample_monitor(1, 1920, 0, 1920, 1080),
        ];
        let id = monitor_for_rect(&monitors, 2000, 100, 400, 300);
        assert_eq!(id, 1);
    }

    #[test]
    fn collapsed_window_includes_hover_and_dpi_slack() {
        let (w1, h1) = compute_collapsed_dimensions(CollapsedFabCount::Two, 1.0);
        let (w15, h15) = compute_collapsed_dimensions(CollapsedFabCount::Two, 1.5);
        assert!(w15 > w1, "1.5x DPI width should exceed 1.0x ({w15} vs {w1})");
        assert!(h15 > h1, "1.5x DPI height should exceed 1.0x ({h15} vs {h1})");
        assert!(w15 >= 76);
        assert!(h15 >= 76);
    }

    #[test]
    fn collapsed_dimensions_one_two_three() {
        let (one_w, one_h) = compute_collapsed_dimensions(CollapsedFabCount::One, 1.0);
        let (two_w, two_h) = compute_collapsed_dimensions(CollapsedFabCount::Two, 1.0);
        let (three_w, three_h) = compute_collapsed_dimensions(CollapsedFabCount::Three, 1.0);

        assert_eq!(one_w, COLLAPSED_SIZE + 2 * COLLAPSED_PAD + FAB_HOVER_SLACK);
        assert_eq!(one_h, COLLAPSED_SIZE + 2 * COLLAPSED_PAD + FAB_HOVER_SLACK);
        assert_eq!(two_w, one_w);
        assert_eq!(
            two_h,
            COLLAPSED_SIZE * 2 + COLLAPSED_FAB_GAP + 2 * COLLAPSED_PAD + FAB_HOVER_SLACK
        );
        assert_eq!(three_w, one_w);
        assert_eq!(
            three_h,
            COLLAPSED_SIZE * 3 + COLLAPSED_FAB_GAP * 2 + 2 * COLLAPSED_PAD + FAB_HOVER_SLACK
        );
    }

    #[test]
    fn collapsed_single_monitor_bottom_right() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(
            &monitors, 0, true, false, false, 0.5, false, false, MINI_KEYBOARD_HEIGHT_RATIO, 1.0,
        )
        .unwrap();
        let (expected_w, expected_h) =
            compute_collapsed_dimensions(CollapsedFabCount::One, 1.0);

        assert_eq!(layout.width, expected_w);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.x, 1920 - expected_w as i32 - 16);
        assert_eq!(layout.y, 540 + 540 - expected_h as i32 - 16);
    }

    #[test]
    fn collapsed_with_dictation_is_taller() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(
            &monitors, 0, true, true, false, 1.0, false, false, MINI_KEYBOARD_HEIGHT_RATIO, 1.0,
        )
        .unwrap();
        let (expected_w, expected_h) =
            compute_collapsed_dimensions(CollapsedFabCount::Two, 1.0);

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
        let layout = compute_window_layout(
            &monitors, 1, true, false, false, 1.0, false, false, MINI_KEYBOARD_HEIGHT_RATIO, 1.0,
        )
        .unwrap();
        let (expected_w, expected_h) =
            compute_collapsed_dimensions(CollapsedFabCount::One, 1.0);

        assert_eq!(layout.width, expected_w);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.x, 1920 + 1920 - expected_w as i32 - 16);
        assert_eq!(layout.y, 1080 - expected_h as i32 - 16);
    }

    #[test]
    fn expanded_full_ratio_fills_single_monitor_region() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(
            &monitors, 0, false, false, false, 1.0, false, false, MINI_KEYBOARD_HEIGHT_RATIO, 1.0,
        )
        .unwrap();

        assert_eq!(layout.x, 0);
        assert_eq!(layout.y, 540);
        assert_eq!(layout.width, 1920);
        assert_eq!(layout.height, 540);
    }

    #[test]
    fn expanded_partial_ratio_bottom_aligned_single_monitor() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(
            &monitors, 0, false, false, false, 0.5, false, false, MINI_KEYBOARD_HEIGHT_RATIO, 1.0,
        )
        .unwrap();

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
        let layout = compute_window_layout(
            &monitors, 1, false, false, false, 0.61, false, false, MINI_KEYBOARD_HEIGHT_RATIO, 1.0,
        )
        .unwrap();

        let expected_h = ((1080.0_f32) * 0.61).round() as u32;
        assert_eq!(layout.x, 1920);
        assert_eq!(layout.width, 1920);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.y + layout.height as i32, 1080);
    }

    #[test]
    fn mini_mode_visible_full_width_bottom_on_1920x1080() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(
            &monitors,
            0,
            false,
            false,
            false,
            0.5,
            true,
            true,
            MINI_KEYBOARD_HEIGHT_RATIO,
            1.0,
        )
        .unwrap();

        let expected_h = ((1080.0_f32) * MINI_KEYBOARD_HEIGHT_RATIO).round() as u32;
        assert_eq!(layout.x, 0);
        assert_eq!(layout.width, 1920);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.y, 1080 - expected_h as i32);
        // Uses full monitor height, not the single-monitor bottom-half region.
        assert_eq!(layout.y + layout.height as i32, 1080);
    }

    #[test]
    fn mini_mode_hidden_three_fab_bottom_right_of_full_monitor() {
        let monitors = vec![sample_monitor(0, 0, 0, 1920, 1080)];
        let layout = compute_window_layout(
            &monitors,
            0,
            true,
            true,
            true,
            0.5,
            true,
            false,
            MINI_KEYBOARD_HEIGHT_RATIO,
            1.0,
        )
        .unwrap();

        let (expected_w, expected_h) =
            compute_collapsed_dimensions(CollapsedFabCount::Three, 1.0);
        assert_eq!(layout.width, expected_w);
        assert_eq!(layout.height, expected_h);
        assert_eq!(layout.x, 1920 - expected_w as i32 - COLLAPSED_MARGIN as i32);
        // Bottom-right of FULL monitor (y near 1080), not bottom-half region (~540+).
        assert_eq!(layout.y, 1080 - expected_h as i32 - COLLAPSED_MARGIN as i32);
        assert!(layout.y > 540, "FAB must sit on full monitor, not bottom half");
    }
}

mod windows;

pub use windows::{get_window_bounds, list_monitors, monitor_for_rect, set_window_bounds};
