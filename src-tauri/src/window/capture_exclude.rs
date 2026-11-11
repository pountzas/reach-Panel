//! Main-window capture exclusion policy.
//!
//! `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` fails on this app's
//! transparent main window with `0x80070008` (`E_OUTOFMEMORY`) at every
//! startup on Windows 11 build 22000. That HRESULT is not memory exhaustion.
//! The plan retries a bounded number of times (the retry clears `WS_EX_LAYERED`
//! around the call, which is what makes the affinity stick on a transparent
//! window), then falls back to `WDA_MONITOR` and stops.
//!
//! Live preview fallback: when exclusion is not active, desktop BitBlt frames
//! whose strip intersects the panel are dropped. Windows.Graphics.Capture and
//! PrintWindow read the target window, not the composed desktop, so they stay.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowDisplayAffinity, GetWindowLongPtrW, IsWindowVisible, SetWindowDisplayAffinity,
    SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, WDA_EXCLUDEFROMCAPTURE, WDA_MONITOR, WS_EX_LAYERED,
};

/// `WDA_EXCLUDEFROMCAPTURE` failures treated as retryable.
pub const HRESULT_NOT_ENOUGH_MEMORY: u32 = 0x8007_0008;

/// Failed exclude attempts before `WDA_MONITOR`.
pub const EXCLUDE_RETRY_LIMIT: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureAffinity {
    None,
    Monitor,
    ExcludeFromCapture,
    Other(u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureExclusionAction {
    Skip,
    ApplyExclude,
    RetryExclude,
    ApplyMonitorFallback,
    Stop,
}

/// `attempt` is how many exclude calls have already failed.
/// `last_error` is the HRESULT from the latest failure (`None` before the first call).
pub fn capture_exclusion_plan(
    current: CaptureAffinity,
    attempt: u32,
    last_error: Option<u32>,
) -> CaptureExclusionAction {
    if current == CaptureAffinity::ExcludeFromCapture {
        return CaptureExclusionAction::Skip;
    }
    match last_error {
        None => CaptureExclusionAction::ApplyExclude,
        Some(HRESULT_NOT_ENOUGH_MEMORY) if attempt < EXCLUDE_RETRY_LIMIT => {
            CaptureExclusionAction::RetryExclude
        }
        Some(_) if current != CaptureAffinity::Monitor && attempt <= EXCLUDE_RETRY_LIMIT => {
            CaptureExclusionAction::ApplyMonitorFallback
        }
        _ => CaptureExclusionAction::Stop,
    }
}

#[derive(Debug, Default)]
pub struct ExclusionLogGate {
    warned: bool,
}

impl ExclusionLogGate {
    /// First failure in the session returns true; later failures stay quiet.
    pub fn should_warn(&mut self) -> bool {
        if self.warned {
            false
        } else {
            self.warned = true;
            true
        }
    }
}

static LOG_GATE: Mutex<ExclusionLogGate> = Mutex::new(ExclusionLogGate { warned: false });
static EXCLUSION_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn exclusion_active() -> bool {
    EXCLUSION_ACTIVE.load(Ordering::Acquire)
}

/// Apply exclusion to the main window. Idempotent when affinity is already
/// `WDA_EXCLUDEFROMCAPTURE`. Logs at most one warning per process.
pub fn apply_main_window_exclusion(hwnd: isize) -> Result<(), String> {
    if hwnd == 0 {
        return Err("invalid hwnd".into());
    }
    let handle = HWND(hwnd as *mut core::ffi::c_void);
    let mut attempt = 0u32;
    let mut last_error = None;
    loop {
        let current = read_affinity(handle);
        let action = capture_exclusion_plan(current, attempt, last_error);
        match action {
            CaptureExclusionAction::Skip => {
                EXCLUSION_ACTIVE.store(true, Ordering::Release);
                return Ok(());
            }
            CaptureExclusionAction::Stop => {
                EXCLUSION_ACTIVE.store(false, Ordering::Release);
                let code = last_error.unwrap_or(0);
                warn_once(handle, current, code);
                return Err(format!("capture exclusion stopped ({code:#010x})"));
            }
            CaptureExclusionAction::ApplyExclude | CaptureExclusionAction::RetryExclude => {
                let layered_retry =
                    action == CaptureExclusionAction::RetryExclude && window_is_layered(handle);
                let restored = if layered_retry {
                    Some(clear_layered(handle))
                } else {
                    None
                };
                let result = unsafe { SetWindowDisplayAffinity(handle, WDA_EXCLUDEFROMCAPTURE) };
                if let Some(previous) = restored {
                    restore_exstyle(handle, previous);
                }
                match result {
                    Ok(()) => {
                        EXCLUSION_ACTIVE.store(true, Ordering::Release);
                        if layered_retry {
                            log::info!(
                                "main window capture exclusion applied after clearing WS_EX_LAYERED"
                            );
                        }
                        return Ok(());
                    }
                    Err(err) => {
                        let code = err.code().0 as u32;
                        if attempt == 0 {
                            warn_once(handle, current, code);
                        }
                        last_error = Some(code);
                        attempt = attempt.saturating_add(1);
                    }
                }
            }
            CaptureExclusionAction::ApplyMonitorFallback => {
                match unsafe { SetWindowDisplayAffinity(handle, WDA_MONITOR) } {
                    Ok(()) => {
                        EXCLUSION_ACTIVE.store(false, Ordering::Release);
                        warn_once(
                            handle,
                            current,
                            last_error.unwrap_or(HRESULT_NOT_ENOUGH_MEMORY),
                        );
                        log::warn!(
                            "main window capture exclusion downgraded to WDA_MONITOR; desktop BitBlt preview drops strips that overlap the panel"
                        );
                        return Ok(());
                    }
                    Err(err) => {
                        last_error = Some(err.code().0 as u32);
                        attempt = attempt.saturating_add(1);
                    }
                }
            }
        }
    }
}

fn warn_once(hwnd: HWND, current: CaptureAffinity, hresult: u32) {
    let mut gate = LOG_GATE.lock().unwrap_or_else(|e| e.into_inner());
    if !gate.should_warn() {
        return;
    }
    let exstyle = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 };
    let visible = unsafe { IsWindowVisible(hwnd).as_bool() };
    log::warn!(
        "main window capture exclusion failed hresult={hresult:#010x} affinity={current:?} exstyle={exstyle:#x} layered={} visible={visible}",
        exstyle & WS_EX_LAYERED.0 != 0
    );
}

fn read_affinity(hwnd: HWND) -> CaptureAffinity {
    let mut value = 0u32;
    if unsafe { GetWindowDisplayAffinity(hwnd, &mut value) }.is_err() {
        return CaptureAffinity::None;
    }
    if value == WDA_EXCLUDEFROMCAPTURE.0 {
        CaptureAffinity::ExcludeFromCapture
    } else if value == WDA_MONITOR.0 {
        CaptureAffinity::Monitor
    } else if value == 0 {
        CaptureAffinity::None
    } else {
        CaptureAffinity::Other(value)
    }
}

fn window_is_layered(hwnd: HWND) -> bool {
    let exstyle = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    exstyle & WS_EX_LAYERED.0 != 0
}

fn clear_layered(hwnd: HWND) -> isize {
    let previous = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    let cleared = previous & !(WS_EX_LAYERED.0 as isize);
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, cleared);
        let _ = SetWindowPos(
            hwnd,
            HWND::default(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
    previous
}

fn restore_exstyle(hwnd: HWND, previous: isize) {
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, previous);
        let _ = SetWindowPos(
            hwnd,
            HWND::default(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PxRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BitbltOcclusion {
    KeepFrame,
    DropFrame,
}

/// Drop a desktop BitBlt strip that would show the panel when exclusion is off.
pub fn bitblt_panel_occlusion(
    exclusion_active: bool,
    desktop_bitblt: bool,
    strip: PxRect,
    panel: PxRect,
) -> BitbltOcclusion {
    if exclusion_active || !desktop_bitblt || !rects_intersect(strip, panel) {
        BitbltOcclusion::KeepFrame
    } else {
        BitbltOcclusion::DropFrame
    }
}

fn rects_intersect(a: PxRect, b: PxRect) -> bool {
    if a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0 {
        return false;
    }
    let ax2 = a.left.saturating_add(a.width);
    let ay2 = a.top.saturating_add(a.height);
    let bx2 = b.left.saturating_add(b.width);
    let by2 = b.top.saturating_add(b.height);
    a.left < bx2 && b.left < ax2 && a.top < by2 && b.top < ay2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_when_already_excluded() {
        assert_eq!(
            capture_exclusion_plan(CaptureAffinity::ExcludeFromCapture, 0, None),
            CaptureExclusionAction::Skip
        );
        assert_eq!(
            capture_exclusion_plan(
                CaptureAffinity::ExcludeFromCapture,
                5,
                Some(HRESULT_NOT_ENOUGH_MEMORY)
            ),
            CaptureExclusionAction::Skip
        );
    }

    #[test]
    fn first_attempt_applies_exclude() {
        assert_eq!(
            capture_exclusion_plan(CaptureAffinity::None, 0, None),
            CaptureExclusionAction::ApplyExclude
        );
    }

    #[test]
    fn retries_oom_until_limit_then_falls_back() {
        for attempt in 1..EXCLUDE_RETRY_LIMIT {
            assert_eq!(
                capture_exclusion_plan(
                    CaptureAffinity::None,
                    attempt,
                    Some(HRESULT_NOT_ENOUGH_MEMORY)
                ),
                CaptureExclusionAction::RetryExclude,
                "attempt {attempt}"
            );
        }
        assert_eq!(
            capture_exclusion_plan(
                CaptureAffinity::None,
                EXCLUDE_RETRY_LIMIT,
                Some(HRESULT_NOT_ENOUGH_MEMORY)
            ),
            CaptureExclusionAction::ApplyMonitorFallback
        );
    }

    #[test]
    fn stops_after_fallback_so_it_cannot_loop() {
        assert_eq!(
            capture_exclusion_plan(
                CaptureAffinity::Monitor,
                EXCLUDE_RETRY_LIMIT,
                Some(HRESULT_NOT_ENOUGH_MEMORY)
            ),
            CaptureExclusionAction::Stop
        );
        assert_eq!(
            capture_exclusion_plan(
                CaptureAffinity::None,
                EXCLUDE_RETRY_LIMIT + 1,
                Some(HRESULT_NOT_ENOUGH_MEMORY)
            ),
            CaptureExclusionAction::Stop
        );
    }

    #[test]
    fn non_retryable_error_falls_back_once_then_stops() {
        assert_eq!(
            capture_exclusion_plan(CaptureAffinity::None, 1, Some(0x8007_0057)),
            CaptureExclusionAction::ApplyMonitorFallback
        );
        assert_eq!(
            capture_exclusion_plan(CaptureAffinity::Monitor, 2, Some(0x8007_0057)),
            CaptureExclusionAction::Stop
        );
    }

    #[test]
    fn warns_once_per_session() {
        let mut gate = ExclusionLogGate::default();
        assert!(gate.should_warn());
        assert!(!gate.should_warn());
        assert!(!gate.should_warn());
    }

    #[test]
    fn drops_bitblt_frame_when_strip_hits_unexcluded_panel() {
        let strip = PxRect {
            left: 100,
            top: 800,
            width: 320,
            height: 48,
        };
        let panel = PxRect {
            left: 80,
            top: 780,
            width: 900,
            height: 200,
        };
        assert_eq!(
            bitblt_panel_occlusion(false, true, strip, panel),
            BitbltOcclusion::DropFrame
        );
        assert!(rects_intersect(strip, panel));
    }

    #[test]
    fn keeps_frame_when_excluded_or_not_bitblt_or_disjoint() {
        let strip = PxRect {
            left: 0,
            top: 0,
            width: 100,
            height: 40,
        };
        let panel = PxRect {
            left: 0,
            top: 500,
            width: 400,
            height: 200,
        };
        assert_eq!(
            bitblt_panel_occlusion(true, true, strip, panel),
            BitbltOcclusion::KeepFrame
        );
        assert_eq!(
            bitblt_panel_occlusion(false, false, strip, strip),
            BitbltOcclusion::KeepFrame
        );
        assert_eq!(
            bitblt_panel_occlusion(false, true, strip, panel),
            BitbltOcclusion::KeepFrame
        );
    }
}
