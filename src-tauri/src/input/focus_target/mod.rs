//! Focus target tracking: which external window/control accepts typed input.

mod uia;
mod win32;

#[cfg(test)]
mod tests;

pub use win32::{host_is_chromium, is_editable_class, is_valid_typing_target};

use uia::{
    clear_last_real_text_focus, note_text_focus, previously_text_focused,
    should_retain_text_focus, uia_ancestor_is_autocomplete_satellite, uia_caret_point,
    uia_control_is_text_input, uia_element_belongs_to_remembered_text_focus,
    uia_element_aria_role, uia_element_bounds, uia_element_framework_id,
    uia_element_has_text_pattern, uia_element_is_our_process, uia_element_native_class,
    uia_element_text_pattern_editable, uia_element_value_writable,
    uia_signals_are_autocomplete_satellite, with_uia, UiaTextInputSignals,
};
use win32::{
    bring_to_foreground, gui_thread_info, hwnd_or_ancestor_is_editable, hwnd_or_ancestor_is_shell,
    hwnd_to_usize, is_null, is_our_window, is_readonly_edit, usize_to_hwnd, win32_caret_point,
    window_class_name,
};

use anyhow::Result;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, Once, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::Accessibility::{
    IUIAutomationElement, SetWinEventHook, HWINEVENTHOOK,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetParent, GetWindowRect, EVENT_OBJECT_FOCUS, EVENT_SYSTEM_FOREGROUND,
    WINEVENT_OUTOFCONTEXT,
};

static TARGET_HWND: Mutex<Option<usize>> = Mutex::new(None);
static TARGET_BOUNDS: Mutex<Option<StickyTargetBounds>> = Mutex::new(None);
static HOOK_ONCE: Once = Once::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LAST_INPUT_FOCUSED: Mutex<Option<bool>> = Mutex::new(None);
/// Coalesce deferred focus reevals; never call UIA inside a WinEvent hook.
static REEVAL_DIRTY: AtomicBool = AtomicBool::new(false);
static REEVAL_WORKER: Once = Once::new();
static REEVAL_LOCK: Mutex<()> = Mutex::new(());
static REEVAL_CV: Condvar = Condvar::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct StickyTargetBounds {
    hwnd: usize,
    rect: ScreenRect,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub struct ScreenRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

impl ScreenRect {
    fn from_win32(rect: RECT) -> Option<Self> {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return None;
        }
        Some(Self {
            left: rect.left,
            top: rect.top,
            width,
            height,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
struct FocusChangedPayload {
    focused: bool,
}

pub fn init(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
    install_hooks();
    schedule_reevaluate_input_focus();
}

fn install_hooks() {
    HOOK_ONCE.call_once(|| {
        unsafe {
            let foreground = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(foreground_hook),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            if !foreground.is_invalid() {
                // HWINEVENTHOOK is Copy and has no Drop impl; keep hook registered for app lifetime.
                let _ = foreground;
            }

            let focus = SetWinEventHook(
                EVENT_OBJECT_FOCUS,
                EVENT_OBJECT_FOCUS,
                None,
                Some(object_focus_hook),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            if !focus.is_invalid() {
                let _ = focus;
            }
        }
    });
}

fn set_target_hwnd(hwnd_key: usize) {
    let changed = if let Ok(mut target) = TARGET_HWND.lock() {
        let changed = *target != Some(hwnd_key);
        *target = Some(hwnd_key);
        changed
    } else {
        false
    };
    if changed {
        if let Ok(mut bounds) = TARGET_BOUNDS.lock() {
            *bounds = None;
        }
    }
}

fn remember_hwnd_as_target(hwnd: HWND) {
    if !is_valid_typing_target(hwnd) {
        return;
    }
    set_target_hwnd(hwnd_to_usize(hwnd));
}

/// Reuse cached strip geometry only when it belongs to the same target HWND.
pub(crate) fn sticky_rect_for_target(
    cached_hwnd: Option<usize>,
    cached_rect: Option<ScreenRect>,
    current_hwnd: Option<usize>,
) -> Option<ScreenRect> {
    match (cached_hwnd, cached_rect, current_hwnd) {
        (Some(cached), Some(rect), Some(current)) if cached == current => Some(rect),
        _ => None,
    }
}

fn sticky_bounds_for_hwnd(hwnd_key: usize) -> Option<ScreenRect> {
    let cached = TARGET_BOUNDS.lock().ok().and_then(|g| *g)?;
    sticky_rect_for_target(Some(cached.hwnd), Some(cached.rect), Some(hwnd_key))
}

fn store_target_bounds(rect: ScreenRect) {
    let hwnd_key = TARGET_HWND.lock().ok().and_then(|g| *g);
    let Some(hwnd_key) = hwnd_key else {
        if let Ok(mut bounds) = TARGET_BOUNDS.lock() {
            *bounds = None;
        }
        return;
    };
    if let Ok(mut bounds) = TARGET_BOUNDS.lock() {
        *bounds = Some(StickyTargetBounds {
            hwnd: hwnd_key,
            rect,
        });
    }
}

fn remember_uia_focus_target(element: &IUIAutomationElement) {
    unsafe {
        let hwnd = element.CurrentNativeWindowHandle().unwrap_or_default();
        if !is_null(hwnd) {
            // Prefer the native HWND; if it is a shell root, keep walking is unnecessary —
            // is_valid_typing_target accepts non-shell HWNDs (e.g. Edit children).
            if is_valid_typing_target(hwnd) {
                remember_hwnd_as_target(hwnd);
                return;
            }
        }
        let fg = GetForegroundWindow();
        if is_valid_typing_target(fg) {
            remember_hwnd_as_target(fg);
        }
    }
}

fn uia_focused_is_text_input() -> Option<bool> {
    with_uia(|automation| {
        let element = unsafe { automation.GetFocusedElement().ok()? };
        if uia_element_is_our_process(&element) {
            return Some(false);
        }
        // Taskbar / desktop chrome: never keep the keyboard up via stale Win32 caret.
        let focus_hwnd = unsafe { element.CurrentNativeWindowHandle().unwrap_or_default() };
        if !is_null(focus_hwnd) && hwnd_or_ancestor_is_shell(focus_hwnd) {
            clear_last_real_text_focus();
            return Some(false);
        }
        let control_type = unsafe { element.CurrentControlType().ok()?.0 };
        let framework_id = uia_element_framework_id(&element);
        let native_class = uia_element_native_class(&element);
        let foreground_class = unsafe { window_class_name(GetForegroundWindow()) };
        let has_text_pattern = uia_element_has_text_pattern(&element);
        let signals = UiaTextInputSignals {
            control_type,
            value_writable: uia_element_value_writable(&element),
            // FrameworkId catches WebView2 in non-Chrome top-level hosts;
            // HWND / FG class cover cases where FrameworkId is empty.
            is_chromium_document: host_is_chromium(&framework_id, &native_class, &foreground_class),
            aria_role: uia_element_aria_role(&element),
            has_text_pattern,
            text_pattern_editable: has_text_pattern && uia_element_text_pattern_editable(&element),
        };
        let is_text = uia_control_is_text_input(signals);
        if is_text {
            note_text_focus(&element);
            remember_uia_focus_target(&element);
            return Some(true);
        }
        let previously = previously_text_focused();
        let satellite = if !previously || !uia_element_belongs_to_remembered_text_focus(&element) {
            false
        } else if uia_signals_are_autocomplete_satellite(signals) {
            true
        } else {
            uia_ancestor_is_autocomplete_satellite(automation, &element)
        };
        let focused = should_retain_text_focus(false, satellite, previously);
        if focused {
            note_text_focus(&element);
        } else {
            clear_last_real_text_focus();
        }
        Some(focused)
    })
    .flatten()
}

/// True when an external app's focusable input-like control is active.
fn is_editable_input_focused() -> bool {
    // UI Automation covers WinUI / UWP / Search / Chromium inputs that lack
    // classic Win32 Edit classes or hwndCaret. When UIA names a concrete
    // focused element that is not a text field (taskbar, button, etc.), trust
    // that — do not keep the keyboard up from a stale Win32 caret in the
    // previous editor.
    if let Some(focused) = uia_focused_is_text_input() {
        return focused;
    }

    unsafe {
        let fg = GetForegroundWindow();
        if !is_valid_typing_target(fg) {
            return false;
        }

        let Some(info) = gui_thread_info() else {
            return hwnd_or_ancestor_is_editable(fg) || is_editable_class(&window_class_name(fg));
        };

        // Caret in a real Edit/RichEdit is a strong signal. Browser renderer
        // HWNDs often have a caret even when a slider/button is focused.
        if !is_null(info.hwndCaret) && !is_our_window(info.hwndCaret) {
            let caret_class = window_class_name(info.hwndCaret);
            if is_editable_class(&caret_class) && !is_readonly_edit(info.hwndCaret, &caret_class) {
                return true;
            }
        }

        let focus = if !is_null(info.hwndFocus) {
            info.hwndFocus
        } else {
            fg
        };

        if is_our_window(focus) {
            return false;
        }

        hwnd_or_ancestor_is_editable(focus) || hwnd_or_ancestor_is_editable(fg)
    }
}

fn emit_focus_changed(app: &AppHandle, focused: bool) {
    let _ = app.emit("input-focus-changed", FocusChangedPayload { focused });
}

fn publish_input_focus(focused: bool) {
    if let Ok(mut last) = LAST_INPUT_FOCUSED.lock() {
        if *last == Some(focused) {
            return;
        }
        *last = Some(focused);
    }
    if let Some(app) = APP_HANDLE.get() {
        emit_focus_changed(app, focused);
    }
}

/// Current editable-focus signal (same value last sent as `input-focus-changed`).
pub fn is_input_focused() -> bool {
    LAST_INPUT_FOCUSED
        .lock()
        .ok()
        .and_then(|g| *g)
        .unwrap_or(false)
}

fn reevaluate_input_focus() {
    let focused = is_editable_input_focused();
    publish_input_focus(focused);
    publish_input_target_bounds(focused);
}

fn publish_input_target_bounds(focused: bool) {
    let live = if focused {
        query_focused_input_bounds()
    } else {
        None
    };
    let hwnd_key = TARGET_HWND.lock().ok().and_then(|g| *g);
    let sticky = hwnd_key.and_then(sticky_bounds_for_hwnd);
    // Keep last strip while the same typing HWND remains (even if UIA focus briefly leaves).
    let allow_sticky = hwnd_key.is_some() && has_input_target();
    let next = resolve_bounds_with_sticky(live, sticky, allow_sticky);
    let prev = sticky;
    let changed = prev != next;
    if let Some(rect) = next {
        store_target_bounds(rect);
    } else if let Ok(mut guard) = TARGET_BOUNDS.lock() {
        *guard = None;
    }
    if changed {
        super::input_preview::notify_bounds_changed();
    }
}

/// Prefer a fresh UIA strip.
///
/// `allow_sticky`: reuse the last good strip only when geometry is still trustworthy
/// (e.g. ReachPanel owns foreground but the external typing HWND remains). During
/// window drag/scroll UIA misses, sticky screen coords are stale — callers should
/// hold the last JPEG instead of BitBlt'ing the wrong place.
pub(crate) fn resolve_bounds_with_sticky(
    live: Option<ScreenRect>,
    sticky: Option<ScreenRect>,
    allow_sticky: bool,
) -> Option<ScreenRect> {
    if let Some(live) = live {
        return Some(live);
    }
    if allow_sticky {
        sticky
    } else {
        None
    }
}

fn foreground_is_ours() -> bool {
    unsafe { is_our_window(GetForegroundWindow()) }
}

pub fn get_input_target_bounds() -> Option<ScreenRect> {
    let live = query_focused_input_bounds();
    if let Some(live) = live {
        store_target_bounds(live);
        return Some(live);
    }
    // ReachPanel foreground: field geometry usually unchanged; sticky + WDA capture
    // still shows the underlying input. Otherwise return None → KeepLastFrame.
    // Sticky reuse requires the cached identity to match the current target HWND.
    let hwnd_key = TARGET_HWND.lock().ok().and_then(|g| *g)?;
    let allow_sticky = has_input_target() && foreground_is_ours();
    let sticky = sticky_bounds_for_hwnd(hwnd_key);
    resolve_bounds_with_sticky(None, sticky, allow_sticky)
}

fn query_focused_input_bounds() -> Option<ScreenRect> {
    let from_element = with_uia(|automation| {
        let element = unsafe { automation.GetFocusedElement().ok()? };
        if uia_element_is_our_process(&element) {
            return None;
        }
        let uia = uia_element_bounds(&element);
        let win32 = win32_caret_point()
            .filter(|&(x, y)| uia.map(|b| point_in_rect(b, x, y)).unwrap_or(false));
        let caret = win32.or_else(|| uia_caret_point(&element));
        if uia.is_some() || caret.is_some() {
            line_strip_bounds(uia, caret)
        } else {
            None
        }
    })
    .flatten();
    if from_element.is_some() {
        return from_element;
    }
    line_strip_bounds(None, win32_caret_point()).or_else(window_focus_bounds)
}

/// Target capture strip for the live input preview (~one text line).
pub const LINE_STRIP_WIDTH: i32 = 320;
pub const LINE_STRIP_HEIGHT: i32 = 48;

const NARROW_UIA_WIDTH: i32 = 160;

/// Pure helper: crop/expand UIA + caret into a ~320×48 line strip for BitBlt preview.
///
/// The writing caret stays at the center of the strip when the field is large
/// enough. Caret is used only when it sits inside the UIA rect (GetCaretPos often
/// reports window chrome). Large fields stay contained. Only fields that are
/// small in both axes expand around the caret.
pub(crate) fn line_strip_bounds(
    uia: Option<ScreenRect>,
    caret: Option<(i32, i32)>,
) -> Option<ScreenRect> {
    match (uia, caret) {
        (None, None) => None,
        (None, Some((x, y))) => Some(strip_around_point(x, y)),
        (Some(uia), caret) => Some(line_strip_from_uia(uia, caret)),
    }
}

fn strip_around_point(x: i32, y: i32) -> ScreenRect {
    ScreenRect {
        left: x.saturating_sub(LINE_STRIP_WIDTH / 2),
        top: y.saturating_sub(LINE_STRIP_HEIGHT / 2),
        width: LINE_STRIP_WIDTH,
        height: LINE_STRIP_HEIGHT,
    }
}

fn point_in_rect(uia: ScreenRect, x: i32, y: i32) -> bool {
    x >= uia.left
        && y >= uia.top
        && x < uia.left.saturating_add(uia.width)
        && y < uia.top.saturating_add(uia.height)
}

/// Crop a 320×48 window that stays inside a large field. The writing caret is
/// locked to the center of the strip; without a caret, use the field's top-left.
fn contained_inside_uia(uia: ScreenRect, caret: Option<(i32, i32)>) -> ScreenRect {
    let width = LINE_STRIP_WIDTH.min(uia.width.max(1));
    let height = LINE_STRIP_HEIGHT.min(uia.height.max(1));
    let (anchor_x, anchor_y) = match caret {
        Some((x, y)) => (x, y),
        None => (uia.left, uia.top),
    };
    let mut left = anchor_x.saturating_sub(width / 2);
    let mut top = anchor_y.saturating_sub(height / 2);
    let max_left = uia.left.saturating_add(uia.width.saturating_sub(width));
    let max_top = uia.top.saturating_add(uia.height.saturating_sub(height));
    left = left.clamp(uia.left, max_left);
    top = top.clamp(uia.top, max_top);
    ScreenRect {
        left,
        top,
        width,
        height,
    }
}

fn line_strip_from_uia(uia: ScreenRect, caret: Option<(i32, i32)>) -> ScreenRect {
    let caret = caret.filter(|&(x, y)| point_in_rect(uia, x, y));
    let tiny = uia.height < LINE_STRIP_HEIGHT && uia.width < NARROW_UIA_WIDTH;

    if tiny {
        return match caret {
            Some((x, y)) => strip_around_point(x, y),
            None => {
                let cx = uia.left.saturating_add(uia.width / 2);
                let cy = uia.top.saturating_add(uia.height / 2);
                strip_around_point(cx, cy)
            }
        };
    }

    contained_inside_uia(uia, caret)
}

fn window_focus_bounds() -> Option<ScreenRect> {
    unsafe {
        let hwnd = get_effective_input_hwnd()?;
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return None;
        }
        ScreenRect::from_win32(rect)
    }
}

/// Schedule focus reevaluation off the WinEvent callback stack.
/// Calling UI Automation inside a hook re-enters the message loop and can abort
/// the process (STATUS_STACK_BUFFER_OVERRUN) — see GetFocusedElement crash.
fn schedule_reevaluate_input_focus() {
    ensure_reeval_worker();
    REEVAL_DIRTY.store(true, Ordering::Release);
    let _guard = REEVAL_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    REEVAL_CV.notify_one();
}

fn ensure_reeval_worker() {
    REEVAL_WORKER.call_once(|| {
        let _ = thread::Builder::new()
            .name("focus-reeval".into())
            .spawn(|| {
                loop {
                    {
                        let guard = REEVAL_LOCK.lock().unwrap_or_else(|e| e.into_inner());
                        let _guard = REEVAL_CV
                            .wait_while(guard, |_| !REEVAL_DIRTY.load(Ordering::Acquire))
                            .unwrap_or_else(|e| e.into_inner());
                    }
                    // Leave the WinEvent / message-callback stack before touching UIA.
                    // Debounce coalesces bursts onto this long-lived COM/UIA worker.
                    thread::sleep(Duration::from_millis(32));
                    REEVAL_DIRTY.store(false, Ordering::Release);
                    reevaluate_input_focus();
                }
            });
    });
}

unsafe extern "system" fn foreground_hook(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _id_thread: u32,
    _time: u32,
) {
    if event != EVENT_SYSTEM_FOREGROUND || is_null(hwnd) {
        return;
    }
    if id_object != 0 || id_child != 0 {
        return;
    }
    if is_valid_typing_target(hwnd) {
        set_target_hwnd(hwnd_to_usize(hwnd));
    }
    schedule_reevaluate_input_focus();
}

unsafe extern "system" fn object_focus_hook(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_thread: u32,
    _time: u32,
) {
    if event != EVENT_OBJECT_FOCUS || is_null(hwnd) {
        return;
    }
    // Keep injection target fresh when focus lands on an external window.
    let root = {
        let mut current = hwnd;
        for _ in 0..16 {
            if is_null(current) {
                break;
            }
            let parent = unsafe { GetParent(current).unwrap_or(HWND::default()) };
            if is_null(parent) {
                break;
            }
            current = parent;
        }
        current
    };
    if is_valid_typing_target(root) {
        set_target_hwnd(hwnd_to_usize(root));
    } else if is_valid_typing_target(hwnd) {
        set_target_hwnd(hwnd_to_usize(hwnd));
    }
    schedule_reevaluate_input_focus();
}

pub fn get_effective_input_hwnd() -> Option<HWND> {
    unsafe {
        let fg = GetForegroundWindow();
        if is_valid_typing_target(fg) {
            return Some(fg);
        }
        let target = TARGET_HWND.lock().ok().and_then(|g| *g)?;
        let hwnd = usize_to_hwnd(target);
        if is_valid_typing_target(hwnd) {
            Some(hwnd)
        } else {
            None
        }
    }
}

/// Same target used for typing — if keys can be injected, language can switch.
pub fn get_language_switch_hwnd() -> Option<HWND> {
    get_effective_input_hwnd()
}

pub fn has_input_target() -> bool {
    get_effective_input_hwnd().is_some()
}

pub fn remember_current_if_external() {
    unsafe {
        let fg = GetForegroundWindow();
        if !is_valid_typing_target(fg) {
            return;
        }
        set_target_hwnd(hwnd_to_usize(fg));
    }
}

pub fn restore_target_focus() -> Result<()> {
    unsafe {
        let fg = GetForegroundWindow();
        if !is_our_window(fg) {
            return Ok(());
        }

        let target = TARGET_HWND.lock().ok().and_then(|g| *g);
        let Some(target_hwnd) = target else {
            return Ok(());
        };
        let hwnd = usize_to_hwnd(target_hwnd);
        if !is_valid_typing_target(hwnd) {
            return Ok(());
        }
        bring_to_foreground(hwnd)?;
    }
    Ok(())
}

pub fn with_target_focus<F, T>(f: F) -> Result<T>
where
    F: FnOnce() -> Result<T>,
{
    restore_target_focus()?;
    f()
}

