//! Unit tests for taskbar detect + position helpers.

use super::super::WindowLayout;
use super::detect::*;
use super::position::*;
use std::collections::HashMap;

fn layout(x: i32, y: i32, w: u32, h: u32) -> WindowLayout {
    WindowLayout {
        x,
        y,
        width: w,
        height: h,
    }
}

#[test]
fn no_overlap_leaves_layout_unchanged() {
    let win = layout(0, 540, 1920, 540);
    let taskbar = RectI {
        left: 0,
        top: 1080,
        right: 1920,
        bottom: 1128,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.x, win.x);
    assert_eq!(out.y, win.y);
    assert_eq!(out.width, win.width);
    assert_eq!(out.height, win.height);
}

#[test]
fn bottom_overlap_lifts_y_keeps_height() {
    let win = layout(0, 540, 1920, 540);
    // Taskbar covers bottom 48px of the window.
    let taskbar = RectI {
        left: 0,
        top: 1032,
        right: 1920,
        bottom: 1080,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.height, 540);
    assert_eq!(out.y, 540 - 48);
    assert_eq!(out.y + out.height as i32, 1032);
    assert_eq!(out.x, 0);
    assert_eq!(out.width, 1920);
}

#[test]
fn left_vertical_taskbar_ignored() {
    let win = layout(100, 100, 800, 600);
    let taskbar = RectI {
        left: 0,
        top: 0,
        right: 48,
        bottom: 1080,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.y, win.y);
    assert_eq!(out.height, win.height);
}

#[test]
fn top_horizontal_bar_ignored() {
    let win = layout(0, 0, 1920, 540);
    let taskbar = RectI {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 40,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.y, win.y);
    assert_eq!(out.height, win.height);
}

#[test]
fn clamp_to_monitor_top_reduces_height() {
    // Window already near top; 80px overlap cannot fully lift.
    let win = layout(0, 10, 1920, 500);
    let taskbar = RectI {
        left: 0,
        top: 430,
        right: 1920,
        bottom: 510,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.y, 0);
    // Bottom stays at taskbar.top (430).
    assert_eq!(out.y + out.height as i32, 430);
    assert_eq!(out.height, 430);
}

#[test]
fn multi_taskbar_picks_max_lift() {
    let win = layout(0, 540, 1920, 540);
    let small = RectI {
        left: 0,
        top: 1050,
        right: 1920,
        bottom: 1080,
    };
    let large = RectI {
        left: 0,
        top: 1000,
        right: 1920,
        bottom: 1080,
    };
    let out = lift_for_bottom_taskbars(win, &[small, large], 0);
    assert_eq!(out.y, 540 - 80);
    assert_eq!(out.height, 540);
}

#[test]
fn no_horizontal_intersection_no_lift() {
    let win = layout(0, 540, 800, 540);
    let taskbar = RectI {
        left: 1920,
        top: 1032,
        right: 3840,
        bottom: 1080,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.y, win.y);
}

#[test]
fn short_window_bottom_taskbar_past_midline_lifts() {
    // Collapsed FAB (~82px) near monitor bottom; 60px taskbar extends past midline.
    let win = layout(0, 998, 1920, 82);
    let taskbar = RectI {
        left: 0,
        top: 1020,
        right: 1920,
        bottom: 1080,
    };
    let out = lift_for_bottom_taskbar_overlap(win, taskbar, 0);
    assert_eq!(out.height, 82);
    assert_eq!(out.y, 998 - 60);
    assert_eq!(out.y + out.height as i32, 1020);
}

#[test]
fn position_byte_mapping() {
    assert_eq!(TaskbarPosition::Top.byte(), 1);
    assert_eq!(TaskbarPosition::Bottom.byte(), 3);
}

#[test]
fn position_from_byte_roundtrip() {
    for pos in [TaskbarPosition::Top, TaskbarPosition::Bottom] {
        assert_eq!(TaskbarPosition::from_byte(pos.byte()), Some(pos));
    }
    assert_eq!(TaskbarPosition::from_byte(0), None);
    assert_eq!(TaskbarPosition::from_byte(2), None);
    assert_eq!(TaskbarPosition::from_byte(9), None);
}

#[test]
fn parse_position_strings() {
    assert_eq!(
        TaskbarPosition::parse("bottom"),
        Some(TaskbarPosition::Bottom)
    );
    assert_eq!(TaskbarPosition::parse("TOP"), Some(TaskbarPosition::Top));
    assert_eq!(TaskbarPosition::parse("left"), None);
    assert_eq!(TaskbarPosition::parse("right"), None);
    assert_eq!(TaskbarPosition::parse("invalid"), None);
}

#[test]
fn horizontal_tray_detection_geometry() {
    let top = RectI {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 48,
    };
    assert!(top.is_horizontal_bar());
    assert_eq!(top.height(), 48);
}

#[test]
fn parse_localdisplay_registry_key() {
    assert_eq!(
        parse_localdisplay_key("LOCALDISPLAY(-3840,0,-1920,1080)"),
        Some((-3840, 0, -1920, 1080))
    );
    assert_eq!(parse_localdisplay_key("Default_Monitor#abc"), None);
}

#[test]
fn build_mm_key_map_matches_localdisplay_monitor() {
    let mut keys = HashMap::new();
    keys.insert("LOCALDISPLAY(-3840,0,-1920,1080)".to_string(), vec![0; 20]);
    keys.insert("Default_Monitor#1".to_string(), vec![0; 20]);
    let monitors = vec![
        MonitorFrame {
            id: 0,
            is_primary: true,
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
            device_name: String::new(),
        },
        MonitorFrame {
            id: 1,
            is_primary: false,
            left: -3840,
            top: 0,
            right: -1920,
            bottom: 1080,
            device_name: String::new(),
        },
    ];
    let map = build_mm_key_map(&keys, &monitors);
    assert_eq!(
        map.get(&1),
        Some(&"LOCALDISPLAY(-3840,0,-1920,1080)".to_string())
    );
    assert_eq!(map.get(&0), Some(&"Default_Monitor#1".to_string()));
}

#[test]
fn detect_taskbar_top_on_secondary_monitor_coords() {
    let frame = MonitorFrame {
        id: 1,
        is_primary: false,
        left: -3840,
        top: 0,
        right: -1920,
        bottom: 1080,
        device_name: String::new(),
    };
    let tray = RectI {
        left: -3840,
        top: 0,
        right: -1920,
        bottom: 48,
    };
    assert_eq!(
        detect_taskbar_position_for_tray(tray, &frame),
        Some(TaskbarPosition::Top)
    );
}

#[test]
fn vertical_tray_is_ignored() {
    let frame = MonitorFrame {
        id: 0,
        is_primary: true,
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
        device_name: String::new(),
    };
    let left_tray = RectI {
        left: 0,
        top: 0,
        right: 48,
        bottom: 1080,
    };
    assert_eq!(detect_taskbar_position_for_tray(left_tray, &frame), None);
}

#[test]
fn live_verification_requires_poll_and_settle_match() {
    assert!(live_position_verified(
        Some(TaskbarPosition::Top),
        Some(TaskbarPosition::Top),
        TaskbarPosition::Top
    ));
    assert!(!live_position_verified(
        Some(TaskbarPosition::Top),
        Some(TaskbarPosition::Bottom),
        TaskbarPosition::Top
    ));
    assert!(!live_position_verified(
        Some(TaskbarPosition::Top),
        None,
        TaskbarPosition::Top
    ));
    assert!(!live_position_verified(
        None,
        Some(TaskbarPosition::Top),
        TaskbarPosition::Top
    ));
}

#[test]
fn registry_match_alone_is_not_live_proof() {
    // Documented contract: only live tray geometry counts for apply success.
    let registry_says_top = Some(TaskbarPosition::Top);
    let live_missing = None;
    assert!(!live_position_verified(
        live_missing,
        registry_says_top,
        TaskbarPosition::Top
    ));
}
