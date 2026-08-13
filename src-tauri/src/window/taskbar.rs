//! Auto-hide taskbar detection and bottom-overlap lift for ReachPanel.
//!
//! Auto-hide taskbars do not shrink `rcWork`; they overlay the work area.
//! When a bottom auto-hide taskbar intersects the window, lift (and optionally
//! shrink) so the bottom key row stays visible.

use super::WindowLayout;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromRect, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, ABM_GETSTATE, ABS_AUTOHIDE, APPBARDATA,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, GetWindowRect, SetWindowPos, HWND_TOP, SWP_NOACTIVATE,
    SWP_NOZORDER, SWP_SHOWWINDOW,
};

/// Axis-aligned rect used by pure lift math (and unit tests).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RectI {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl RectI {
    pub fn width(self) -> i32 {
        self.right.saturating_sub(self.left)
    }

    pub fn height(self) -> i32 {
        self.bottom.saturating_sub(self.top)
    }

    /// Wider than tall → docked top/bottom rather than left/right.
    pub fn is_horizontal_bar(self) -> bool {
        self.width() > self.height() && self.height() > 0
    }
}

/// Lift `layout` so its bottom clears a bottom taskbar that overlaps it.
///
/// Prefers keeping height and moving `y` up by the overlap. If that would go
/// above `monitor_top`, clamp `y` and reduce height so the bottom stays clear.
pub fn lift_for_bottom_taskbar_overlap(
    layout: WindowLayout,
    taskbar: RectI,
    monitor_top: i32,
) -> WindowLayout {
    if !taskbar.is_horizontal_bar() {
        return layout;
    }

    let win_left = layout.x;
    let win_top = layout.y;
    let win_right = layout.x.saturating_add(layout.width as i32);
    let win_bottom = layout.y.saturating_add(layout.height as i32);

    let ix1 = win_left.max(taskbar.left);
    let ix2 = win_right.min(taskbar.right);
    if ix2 <= ix1 {
        return layout;
    }

    let iy1 = win_top.max(taskbar.top);
    let iy2 = win_bottom.min(taskbar.bottom);
    let overlap = iy2 - iy1;
    if overlap <= 0 {
        return layout;
    }

    // Only treat as a *bottom* overlay when the intersection touches the window
    // bottom edge (not a top-docked bar that only grazes the top).
    if iy2 != win_bottom {
        return layout;
    }

    let mut new_y = win_top - overlap;
    let mut new_h = layout.height;

    if new_y < monitor_top {
        new_y = monitor_top;
        // Keep the bottom edge at or above the taskbar top.
        let max_bottom = taskbar.top;
        let max_h = (max_bottom - new_y).max(1) as u32;
        new_h = new_h.min(max_h).max(1);
    }

    WindowLayout {
        x: layout.x,
        y: new_y,
        width: layout.width,
        height: new_h,
    }
}

/// Apply the strongest bottom-overlap lift across multiple taskbar rects.
pub fn lift_for_bottom_taskbars(
    layout: WindowLayout,
    taskbars: &[RectI],
    monitor_top: i32,
) -> WindowLayout {
    let mut best = layout;
    for tb in taskbars {
        let lifted = lift_for_bottom_taskbar_overlap(layout, *tb, monitor_top);
        if lifted.y < best.y
            || (lifted.y == best.y && lifted.height < best.height)
        {
            best = lifted;
        }
    }
    best
}

fn is_taskbar_autohide() -> bool {
    let mut data = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        ..Default::default()
    };
    let state = unsafe { SHAppBarMessage(ABM_GETSTATE, &mut data) } as u32;
    state & ABS_AUTOHIDE != 0
}

fn hwnd_rect(hwnd: HWND) -> Option<RectI> {
    if hwnd.is_invalid() {
        return None;
    }
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(hwnd, &mut rect).ok()?;
    }
    Some(RectI {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
    })
}

fn collect_tray_rects() -> Vec<RectI> {
    let mut rects = Vec::new();

    if let Ok(primary) = unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()) } {
        if let Some(r) = hwnd_rect(primary) {
            rects.push(r);
        }
    }

    let mut after = HWND::default();
    loop {
        let next = unsafe {
            FindWindowExW(
                HWND::default(),
                after,
                w!("Shell_SecondaryTrayWnd"),
                PCWSTR::null(),
            )
        };
        match next {
            Ok(hwnd) if !hwnd.is_invalid() => {
                if let Some(r) = hwnd_rect(hwnd) {
                    rects.push(r);
                }
                after = hwnd;
            }
            _ => break,
        }
    }

    rects
}

fn monitor_top_for_layout(layout: WindowLayout) -> i32 {
    let rect = RECT {
        left: layout.x,
        top: layout.y,
        right: layout.x.saturating_add(layout.width as i32),
        bottom: layout.y.saturating_add(layout.height as i32),
    };
    unsafe {
        let hmonitor = MonitorFromRect(&rect, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmonitor, &mut info).as_bool() {
            return info.rcMonitor.top;
        }
    }
    layout.y
}

/// Lift layout when auto-hide is on and a bottom tray overlaps the window.
pub fn apply_autohide_taskbar_lift(layout: WindowLayout) -> WindowLayout {
    if !is_taskbar_autohide() {
        return layout;
    }
    let trays = collect_tray_rects();
    if trays.is_empty() {
        return layout;
    }
    let monitor_top = monitor_top_for_layout(layout);
    lift_for_bottom_taskbars(layout, &trays, monitor_top)
}

struct LastPlacement {
    hwnd: isize,
    layout: WindowLayout,
}

static LAST_PLACEMENT: Mutex<Option<LastPlacement>> = Mutex::new(None);
static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

fn remember_placement(hwnd: isize, layout: WindowLayout) {
    if let Ok(mut guard) = LAST_PLACEMENT.lock() {
        *guard = Some(LastPlacement { hwnd, layout });
    }
}

fn apply_bounds(hwnd: isize, layout: WindowLayout) -> Result<(), String> {
    unsafe {
        SetWindowPos(
            HWND(hwnd as *mut core::ffi::c_void),
            HWND_TOP,
            layout.x,
            layout.y,
            layout.width as i32,
            layout.height as i32,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Fingerprint of tray geometry used to detect show/hide without WinEvent hooks.
fn tray_fingerprint() -> u64 {
    let autohide = is_taskbar_autohide() as u64;
    let mut hash = autohide;
    for (i, r) in collect_tray_rects().into_iter().enumerate() {
        let i = i as u64;
        hash ^= (r.left as u64).wrapping_mul(0x9E3779B97F4A7C15).wrapping_add(i);
        hash ^= (r.top as u64).wrapping_mul(0xC2B2AE3D27D4EB4F).wrapping_add(i << 8);
        hash ^= (r.right as u64).wrapping_mul(0x165667B19E3779F9).wrapping_add(i << 16);
        hash ^= (r.bottom as u64).wrapping_mul(0x85EBCA77C2B2AE63).wrapping_add(i << 24);
    }
    hash
}

fn ensure_taskbar_watcher() {
    if WATCHER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::Builder::new()
        .name("reachpanel-taskbar-watch".into())
        .spawn(|| {
            let mut last_fp = tray_fingerprint();
            loop {
                std::thread::sleep(Duration::from_millis(250));
                let fp = tray_fingerprint();
                if fp == last_fp {
                    continue;
                }
                last_fp = fp;
                let placement = match LAST_PLACEMENT.lock() {
                    Ok(guard) => guard.as_ref().map(|p| (p.hwnd, p.layout)),
                    Err(_) => None,
                };
                if let Some((hwnd, layout)) = placement {
                    let lifted = apply_autohide_taskbar_lift(layout);
                    let _ = apply_bounds(hwnd, lifted);
                }
            }
        })
        .ok();
}

/// Store the requested layout, start the watcher, apply bounds with auto-hide lift.
pub fn set_window_bounds_with_taskbar_lift(
    hwnd: isize,
    layout: WindowLayout,
) -> Result<(), String> {
    remember_placement(hwnd, layout);
    ensure_taskbar_watcher();
    let lifted = apply_autohide_taskbar_lift(layout);
    apply_bounds(hwnd, lifted)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
