use anyhow::Result;
use serde::Serialize;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, Once, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{BOOL, HWND, POINT, RECT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, SAFEARRAY,
};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId,
};
use windows::Win32::System::Ole::{
    SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetUBound, SafeArrayUnaccessData,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern,
    IUIAutomationTextPattern2, IUIAutomationTextRange, IUIAutomationValuePattern, SetWinEventHook,
    TextPatternRangeEndpoint_End, TextPatternRangeEndpoint_Start, TextUnit_Character,
    UIA_ComboBoxControlTypeId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
    UIA_ListControlTypeId, UIA_ListItemControlTypeId, UIA_TextPattern2Id, UIA_TextPatternId,
    UIA_ValuePatternId, HWINEVENTHOOK, UIA_CONTROLTYPE_ID,
};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetCaretPos, GetClassNameW, GetForegroundWindow, GetGUIThreadInfo, GetParent,
    GetWindowLongW, GetWindowRect, GetWindowThreadProcessId, IsWindow, IsWindowVisible,
    SetForegroundWindow, ShowWindow, ES_READONLY, EVENT_OBJECT_FOCUS, EVENT_SYSTEM_FOREGROUND,
    GUITHREADINFO, GWL_STYLE, SW_RESTORE, WINEVENT_OUTOFCONTEXT,
};

/// How long a real text field can "lend" focus to an autocomplete popup.
pub const LAST_REAL_TEXT_FOCUS_TTL: Duration = Duration::from_secs(30);
const AUTOCOMPLETE_ANCESTOR_WALK_DEPTH: usize = 6;

struct LastRealTextFocus {
    process_id: u32,
    hwnd: usize,
    at: Instant,
}

static TARGET_HWND: Mutex<Option<usize>> = Mutex::new(None);
static TARGET_BOUNDS: Mutex<Option<ScreenRect>> = Mutex::new(None);
static HOOK_ONCE: Once = Once::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LAST_INPUT_FOCUSED: Mutex<Option<bool>> = Mutex::new(None);
static LAST_REAL_TEXT_FOCUS: Mutex<Option<LastRealTextFocus>> = Mutex::new(None);
/// Coalesce deferred focus reevals; never call UIA inside a WinEvent hook.
static REEVAL_DIRTY: AtomicBool = AtomicBool::new(false);
static REEVAL_WORKER: Once = Once::new();
static REEVAL_LOCK: Mutex<()> = Mutex::new(());
static REEVAL_CV: Condvar = Condvar::new();

thread_local! {
    static UIA_LOCAL: RefCell<Option<IUIAutomation>> = const { RefCell::new(None) };
}

/// ARIA role of the focused UIA element, used to reject page landmarks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AriaRoleKind {
    #[default]
    Unspecified,
    TextInput,
    ComboBox,
    AutocompletePopup,
    NotText,
}

/// Signals used to decide whether a UIA-focused control accepts text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UiaTextInputSignals {
    pub control_type: i32,
    pub value_writable: bool,
    /// Chromium reports a page-level Document even when no text field is focused.
    pub is_chromium_document: bool,
    pub aria_role: AriaRoleKind,
}

/// Maps an ARIA role string from UIA (`CurrentAriaRole`) to a classifier bucket.
pub fn classify_aria_role(role: &str) -> AriaRoleKind {
    match role.trim().to_ascii_lowercase().as_str() {
        "" => AriaRoleKind::Unspecified,
        "textbox" | "searchbox" => AriaRoleKind::TextInput,
        "combobox" => AriaRoleKind::ComboBox,
        "option" | "listbox" | "listitem" => AriaRoleKind::AutocompletePopup,
        "main" | "navigation" | "banner" | "complementary" | "contentinfo" | "region"
        | "article" | "heading" | "document" | "application" | "button" | "tab" | "tablist"
        | "link" | "img" | "image" | "slider" | "scrollbar" | "progressbar" | "switch"
        | "checkbox" | "radio" | "list" | "menu" | "menuitem" | "menubar" | "toolbar" | "grid"
        | "gridcell" | "row" | "table" | "dialog" | "alertdialog" | "tooltip" | "group"
        | "none" | "presentation" => AriaRoleKind::NotText,
        _ => AriaRoleKind::Unspecified,
    }
}

/// Pure classifier for UIA control signals (unit-tested without live UIA).
pub fn uia_control_is_text_input(signals: UiaTextInputSignals) -> bool {
    match signals.aria_role {
        AriaRoleKind::NotText | AriaRoleKind::AutocompletePopup => return false,
        AriaRoleKind::TextInput => return true,
        AriaRoleKind::ComboBox => return signals.value_writable,
        AriaRoleKind::Unspecified => {}
    }

    let ty = UIA_CONTROLTYPE_ID(signals.control_type);
    if ty == UIA_EditControlTypeId {
        return true;
    }
    if ty == UIA_DocumentControlTypeId {
        // Word / native editors: Document is the typing surface.
        // Chromium page Document is often writable even for role=main landmarks.
        return !signals.is_chromium_document;
    }
    if ty == UIA_ComboBoxControlTypeId {
        return signals.value_writable;
    }
    false
}

/// Keep the mini keyboard up while focus is on a search autocomplete popup
/// that appeared after a real text field (YouTube suggestions, etc.).
pub fn should_retain_text_focus(
    current_is_text_input: bool,
    current_is_autocomplete_satellite: bool,
    previously_text_focused: bool,
) -> bool {
    current_is_text_input || (previously_text_focused && current_is_autocomplete_satellite)
}

pub fn is_autocomplete_satellite_role(kind: AriaRoleKind) -> bool {
    matches!(kind, AriaRoleKind::AutocompletePopup)
}

pub fn uia_signals_are_autocomplete_satellite(signals: UiaTextInputSignals) -> bool {
    if is_autocomplete_satellite_role(signals.aria_role) {
        return true;
    }
    let ty = UIA_CONTROLTYPE_ID(signals.control_type);
    ty == UIA_ListItemControlTypeId || ty == UIA_ListControlTypeId
}

pub fn is_last_real_text_focus_live(recorded_at: Instant, now: Instant) -> bool {
    now.saturating_duration_since(recorded_at) <= LAST_REAL_TEXT_FOCUS_TTL
}

/// Autocomplete popups may be a child HWND of the same process, or share the field's HWND.
pub fn satellite_matches_remembered_owner(
    current_process_id: u32,
    current_hwnd: usize,
    remembered: Option<(u32, usize)>,
) -> bool {
    let Some((process_id, hwnd)) = remembered else {
        return false;
    };
    (current_process_id != 0 && current_process_id == process_id)
        || (current_hwnd != 0 && hwnd != 0 && current_hwnd == hwnd)
}

fn live_last_real_text_focus() -> Option<(u32, usize)> {
    let guard = LAST_REAL_TEXT_FOCUS.lock().ok()?;
    let last = guard.as_ref()?;
    if !is_last_real_text_focus_live(last.at, Instant::now()) {
        return None;
    }
    Some((last.process_id, last.hwnd))
}

fn previously_text_focused() -> bool {
    live_last_real_text_focus().is_some()
}

fn note_text_focus(element: &IUIAutomationElement) {
    let process_id = uia_element_process_id(element);
    if process_id == 0 {
        return;
    }
    let hwnd = uia_element_hwnd_usize(element);
    if let Ok(mut slot) = LAST_REAL_TEXT_FOCUS.lock() {
        if let Some(last) = slot.as_mut() {
            if last.process_id == process_id {
                last.at = Instant::now();
                if hwnd != 0 {
                    last.hwnd = hwnd;
                }
                return;
            }
        }
        *slot = Some(LastRealTextFocus {
            process_id,
            hwnd,
            at: Instant::now(),
        });
    }
}

fn clear_last_real_text_focus() {
    if let Ok(mut slot) = LAST_REAL_TEXT_FOCUS.lock() {
        *slot = None;
    }
}

fn uia_element_process_id(element: &IUIAutomationElement) -> u32 {
    unsafe { element.CurrentProcessId().ok().map(|pid| pid as u32) }.unwrap_or(0)
}

fn uia_element_hwnd_usize(element: &IUIAutomationElement) -> usize {
    unsafe {
        element
            .CurrentNativeWindowHandle()
            .ok()
            .filter(|hwnd| !is_null(*hwnd))
            .map(hwnd_to_usize)
            .unwrap_or(0)
    }
}

fn uia_element_belongs_to_remembered_text_focus(element: &IUIAutomationElement) -> bool {
    satellite_matches_remembered_owner(
        uia_element_process_id(element),
        uia_element_hwnd_usize(element),
        live_last_real_text_focus(),
    )
}

fn uia_ancestor_is_autocomplete_satellite(
    automation: &IUIAutomation,
    element: &IUIAutomationElement,
) -> bool {
    let Ok(walker) = (unsafe { automation.ControlViewWalker() }) else {
        return false;
    };
    let mut current = element.clone();
    for _ in 0..AUTOCOMPLETE_ANCESTOR_WALK_DEPTH {
        let parent = unsafe { walker.GetParentElement(&current) };
        let Ok(parent) = parent else {
            break;
        };
        if is_autocomplete_satellite_role(uia_element_aria_role(&parent)) {
            return true;
        }
        if let Ok(ty) = unsafe { parent.CurrentControlType() } {
            if ty == UIA_ListItemControlTypeId || ty == UIA_ListControlTypeId {
                return true;
            }
        }
        current = parent;
    }
    false
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

fn is_null(hwnd: HWND) -> bool {
    hwnd.0.is_null()
}

fn hwnd_to_usize(hwnd: HWND) -> usize {
    hwnd.0 as usize
}

fn usize_to_hwnd(value: usize) -> HWND {
    HWND(value as *mut core::ffi::c_void)
}

fn is_our_window(hwnd: HWND) -> bool {
    if is_null(hwnd) {
        return false;
    }
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        pid == GetCurrentProcessId()
    }
}

fn window_class_name(hwnd: HWND) -> String {
    unsafe {
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, &mut buf);
        if len == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }
}

/// Desktop / taskbar are not typing targets.
fn is_shell_window(hwnd: HWND) -> bool {
    let class = window_class_name(hwnd);
    matches!(
        class.as_str(),
        "Progman"
            | "WorkerW"
            | "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "DV2ControlHost"
            | "ForegroundStaging"
            | "ApplicationManager_DesktopShellWindow"
    )
}

pub fn is_valid_typing_target(hwnd: HWND) -> bool {
    if is_null(hwnd) || is_our_window(hwnd) {
        return false;
    }
    unsafe {
        if !IsWindow(hwnd).as_bool() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
    }
    if is_shell_window(hwnd) {
        return false;
    }
    true
}

/// Heuristic: Win32 class names that *are* a text field (not a whole browser page).
pub fn is_editable_class(class: &str) -> bool {
    let lower = class.to_ascii_lowercase();
    if lower == "edit" || lower == "editcomctl32" {
        return true;
    }
    if lower.starts_with("richedit") {
        return true;
    }
    matches!(
        lower.as_str(),
        "scintilla"
            | "_wwg" // Word document window
            | "osalsoframe" // Office content frame (legacy)
            | "netuihwnd" // Outlook compose (heuristic)
    )
}

fn is_readonly_edit(hwnd: HWND, class: &str) -> bool {
    let lower = class.to_ascii_lowercase();
    if lower != "edit" && !lower.starts_with("richedit") {
        return false;
    }
    unsafe {
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        (style & ES_READONLY) != 0
    }
}

fn gui_thread_info() -> Option<GUITHREADINFO> {
    unsafe {
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        // idThread 0 → foreground thread (cross-process focus query).
        if GetGUIThreadInfo(0, &mut info).is_err() {
            return None;
        }
        Some(info)
    }
}

fn hwnd_or_ancestor_is_editable(hwnd: HWND) -> bool {
    let mut current = hwnd;
    for _ in 0..8 {
        if is_null(current) || is_our_window(current) {
            break;
        }
        let class = window_class_name(current);
        if is_editable_class(&class) {
            return !is_readonly_edit(current, &class);
        }
        unsafe {
            current = GetParent(current).unwrap_or(HWND::default());
        }
    }
    false
}

fn is_chromium_class(class: &str) -> bool {
    class.to_ascii_lowercase().starts_with("chrome_")
}

fn ensure_com_for_uia() {
    // Per-thread: CoInitializeEx is required on each thread that uses COM/UIA.
    // S_FALSE / RPC_E_CHANGED_MODE are fine if already initialized.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

fn with_uia<F, R>(f: F) -> Option<R>
where
    F: FnOnce(&IUIAutomation) -> R,
{
    UIA_LOCAL.with(|cell| {
        let mut slot = cell.borrow_mut();
        if slot.is_none() {
            ensure_com_for_uia();
            *slot = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok() };
        }
        slot.as_ref().map(f)
    })
}

fn uia_element_is_our_process(element: &IUIAutomationElement) -> bool {
    unsafe {
        match element.CurrentProcessId() {
            Ok(pid) => pid as u32 == GetCurrentProcessId(),
            Err(_) => false,
        }
    }
}

fn uia_element_native_class(element: &IUIAutomationElement) -> String {
    unsafe {
        let hwnd = element.CurrentNativeWindowHandle().unwrap_or_default();
        if is_null(hwnd) {
            String::new()
        } else {
            window_class_name(hwnd)
        }
    }
}

fn uia_element_aria_role(element: &IUIAutomationElement) -> AriaRoleKind {
    unsafe {
        let role = match element.CurrentAriaRole() {
            Ok(bstr) => bstr.to_string(),
            Err(_) => String::new(),
        };
        classify_aria_role(&role)
    }
}

fn uia_element_value_writable(element: &IUIAutomationElement) -> bool {
    unsafe {
        let pattern = element
            .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            .ok();
        let Some(pattern) = pattern else {
            return false;
        };
        match pattern.CurrentIsReadOnly() {
            Ok(readonly) => !readonly.as_bool(),
            Err(_) => false,
        }
    }
}

fn remember_hwnd_as_target(hwnd: HWND) {
    if !is_valid_typing_target(hwnd) {
        return;
    }
    if let Ok(mut target) = TARGET_HWND.lock() {
        *target = Some(hwnd_to_usize(hwnd));
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
        let control_type = unsafe { element.CurrentControlType().ok()?.0 };
        let native_class = uia_element_native_class(&element);
        let signals = UiaTextInputSignals {
            control_type,
            value_writable: uia_element_value_writable(&element),
            is_chromium_document: is_chromium_class(&native_class),
            aria_role: uia_element_aria_role(&element),
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
    // classic Win32 Edit classes or hwndCaret.
    if let Some(focused) = uia_focused_is_text_input() {
        if focused {
            return true;
        }
        // UIA identified a non-text control. In Chromium the renderer HWND is
        // not a text field — do not let Win32 class/caret heuristics override.
        unsafe {
            let fg = GetForegroundWindow();
            if is_chromium_class(&window_class_name(fg)) {
                return false;
            }
        }
        // Non-browser apps: still allow Win32 heuristics for incomplete UIA trees.
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

fn reevaluate_input_focus() {
    let focused = is_editable_input_focused();
    publish_input_focus(focused);
    publish_input_target_bounds(focused);
}

fn publish_input_target_bounds(focused: bool) {
    let next = if focused {
        query_focused_input_bounds()
    } else {
        None
    };
    let changed = if let Ok(mut guard) = TARGET_BOUNDS.lock() {
        let changed = *guard != next;
        if changed {
            *guard = next;
        }
        changed
    } else {
        false
    };
    if changed {
        super::input_preview::notify_bounds_changed();
    }
}

pub fn get_input_target_bounds() -> Option<ScreenRect> {
    query_focused_input_bounds()
}

fn query_focused_input_bounds() -> Option<ScreenRect> {
    let from_element = with_uia(|automation| {
        let element = unsafe { automation.GetFocusedElement().ok()? };
        if uia_element_is_our_process(&element) {
            return None;
        }
        let uia = uia_element_bounds(&element);
        let win32 = win32_caret_point().filter(|&(x, y)| {
            uia.map(|b| point_in_rect(b, x, y)).unwrap_or(false)
        });
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

fn uia_element_bounds(element: &IUIAutomationElement) -> Option<ScreenRect> {
    unsafe {
        let rect = element.CurrentBoundingRectangle().ok()?;
        ScreenRect::from_win32(rect)
    }
}

fn uia_caret_point(element: &IUIAutomationElement) -> Option<(i32, i32)> {
    unsafe {
        if let Ok(pattern2) =
            element.GetCurrentPatternAs::<IUIAutomationTextPattern2>(UIA_TextPattern2Id)
        {
            let mut active = BOOL(0);
            if let Ok(range) = pattern2.GetCaretRange(&mut active) {
                if let Some(pt) = text_range_caret_point(&range) {
                    return Some(pt);
                }
            }
        }
        let pattern = element
            .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
            .ok()?;
        let ranges = pattern.GetSelection().ok()?;
        let len = ranges.Length().ok()?;
        if len <= 0 {
            return None;
        }
        let range = ranges.GetElement(0).ok()?;
        text_range_caret_point(&range)
    }
}

fn text_range_caret_point(range: &IUIAutomationTextRange) -> Option<(i32, i32)> {
    if let Some(pt) = bounding_rect_center(range) {
        return Some(pt);
    }
    unsafe {
        let probe = range.Clone().ok()?;
        let moved = probe
            .MoveEndpointByUnit(TextPatternRangeEndpoint_End, TextUnit_Character, 1)
            .unwrap_or(0);
        if moved == 0 {
            let _ = probe.MoveEndpointByUnit(
                TextPatternRangeEndpoint_Start,
                TextUnit_Character,
                -1,
            );
        }
        bounding_rect_center(&probe)
    }
}

fn bounding_rect_center(range: &IUIAutomationTextRange) -> Option<(i32, i32)> {
    unsafe {
        let psa = range.GetBoundingRectangles().ok()?;
        first_rect_center(psa)
    }
}

fn first_rect_center(psa: *mut SAFEARRAY) -> Option<(i32, i32)> {
    if psa.is_null() {
        return None;
    }
    unsafe {
        let mut data: *mut std::ffi::c_void = std::ptr::null_mut();
        let accessed = SafeArrayAccessData(psa, &mut data).is_ok();
        let result = if accessed && !data.is_null() {
            match SafeArrayGetUBound(psa, 1) {
                Ok(ubound) if ubound >= 3 => {
                    let vals = std::slice::from_raw_parts(data as *const f64, (ubound + 1) as usize);
                    let left = vals[0];
                    let top = vals[1];
                    let width = vals[2];
                    let height = vals[3];
                    Some((
                        (left + width / 2.0).round() as i32,
                        (top + height / 2.0).round() as i32,
                    ))
                }
                _ => None,
            }
        } else {
            None
        };
        if accessed {
            let _ = SafeArrayUnaccessData(psa);
        }
        let _ = SafeArrayDestroy(psa);
        result
    }
}

fn win32_caret_point() -> Option<(i32, i32)> {
    unsafe {
        let Some(info) = gui_thread_info() else {
            return None;
        };
        let caret_hwnd = if !is_null(info.hwndCaret) && !is_our_window(info.hwndCaret) {
            info.hwndCaret
        } else {
            return None;
        };

        let rc = info.rcCaret;
        let w = rc.right.saturating_sub(rc.left);
        let h = rc.bottom.saturating_sub(rc.top);
        if w > 0 || h > 0 || rc.left != 0 || rc.top != 0 {
            let mut pt = POINT {
                x: rc.left + w / 2,
                y: rc.top + h / 2,
            };
            if ClientToScreen(caret_hwnd, &mut pt).as_bool() {
                return Some((pt.x, pt.y));
            }
        }

        let mut pid = 0;
        let tid = GetWindowThreadProcessId(caret_hwnd, Some(&mut pid));
        let our = GetCurrentThreadId();
        let attached = tid != 0 && tid != our && AttachThreadInput(our, tid, true).as_bool();
        let mut pt = POINT::default();
        let ok = GetCaretPos(&mut pt).is_ok();
        if attached {
            let _ = AttachThreadInput(our, tid, false);
        }
        if !ok || !ClientToScreen(caret_hwnd, &mut pt).as_bool() {
            return None;
        }
        Some((pt.x, pt.y))
    }
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
        if let Ok(mut target) = TARGET_HWND.lock() {
            *target = Some(hwnd_to_usize(hwnd));
        }
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
        if let Ok(mut target) = TARGET_HWND.lock() {
            *target = Some(hwnd_to_usize(root));
        }
    } else if is_valid_typing_target(hwnd) {
        if let Ok(mut target) = TARGET_HWND.lock() {
            *target = Some(hwnd_to_usize(hwnd));
        }
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
        if let Ok(mut target) = TARGET_HWND.lock() {
            *target = Some(hwnd_to_usize(fg));
        }
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

unsafe fn bring_to_foreground(hwnd: HWND) -> Result<()> {
    if GetForegroundWindow() == hwnd {
        return Ok(());
    }

    let fore = GetForegroundWindow();
    let fore_thread = GetWindowThreadProcessId(fore, None);
    let target_thread = GetWindowThreadProcessId(hwnd, None);
    let current_thread = GetCurrentThreadId();

    let attached_fore = if fore_thread != target_thread {
        AttachThreadInput(fore_thread, target_thread, true).as_bool()
    } else {
        false
    };
    let attached_cur = if current_thread != target_thread {
        AttachThreadInput(current_thread, target_thread, true).as_bool()
    } else {
        false
    };

    let _ = ShowWindow(hwnd, SW_RESTORE);
    let _ = SetForegroundWindow(hwnd);
    let _ = BringWindowToTop(hwnd);

    if attached_cur {
        let _ = AttachThreadInput(current_thread, target_thread, false);
    }
    if attached_fore {
        let _ = AttachThreadInput(fore_thread, target_thread, false);
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

#[cfg(test)]
mod tests {
    use super::{
        classify_aria_role, is_editable_class, is_last_real_text_focus_live, line_strip_bounds,
        satellite_matches_remembered_owner, should_retain_text_focus, uia_control_is_text_input,
        uia_signals_are_autocomplete_satellite, AriaRoleKind, ScreenRect, UiaTextInputSignals,
        LAST_REAL_TEXT_FOCUS_TTL, LINE_STRIP_HEIGHT, LINE_STRIP_WIDTH,
    };
    use std::time::{Duration, Instant};

    fn rect(left: i32, top: i32, width: i32, height: i32) -> ScreenRect {
        ScreenRect {
            left,
            top,
            width,
            height,
        }
    }

    #[test]
    fn line_strip_tall_uia_with_caret_crops_to_one_line() {
        let uia = rect(100, 200, 800, 600);
        let caret = (100 + 400, 200 + 300); // middle of UIA
        let strip = line_strip_bounds(Some(uia), Some(caret)).expect("strip");
        assert_eq!(strip.height, LINE_STRIP_HEIGHT);
        assert_eq!(strip.width, LINE_STRIP_WIDTH);
        assert!(
            caret.1 >= strip.top && caret.1 < strip.top + strip.height,
            "caret Y {} not inside strip top={} height={}",
            caret.1,
            strip.top,
            strip.height
        );
        assert!(strip.left >= uia.left);
        assert!(strip.left + strip.width <= uia.left + uia.width);
        assert_eq!(strip.left + strip.width / 2, caret.0);
        assert_eq!(strip.top + strip.height / 2, caret.1);
    }

    #[test]
    fn line_strip_tall_uia_without_caret_uses_top_left_contained_window() {
        let uia = rect(100, 200, 800, 600);
        let strip = line_strip_bounds(Some(uia), None).expect("strip");
        assert_eq!(strip, rect(100, 200, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT));
    }

    #[test]
    fn line_strip_ignores_caret_outside_uia() {
        let uia = rect(100, 200, 400, 300);
        let outside = (900, 80); // typical bogus GetCaretPos on window chrome
        let strip = line_strip_bounds(Some(uia), Some(outside)).expect("strip");
        assert_eq!(strip, rect(100, 200, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT));
    }

    #[test]
    fn line_strip_wide_line_like_uia_is_contained() {
        let uia = rect(50, 90, 900, 40);
        let strip = line_strip_bounds(Some(uia), None).expect("strip");
        assert_eq!(strip, rect(50, 90, LINE_STRIP_WIDTH, 40));
    }

    #[test]
    fn line_strip_short_but_wide_enough_stays_inside_field() {
        let uia = rect(80, 90, 200, 40);
        let strip = line_strip_bounds(Some(uia), None).expect("strip");
        assert_eq!(strip, rect(80, 90, 200, 40));
    }

    #[test]
    fn line_strip_tiny_uia_with_caret_expands_around_caret() {
        let uia = rect(500, 400, 40, 16);
        let caret = (520, 408);
        let strip = line_strip_bounds(Some(uia), Some(caret)).expect("strip");
        assert_eq!(strip.width, LINE_STRIP_WIDTH);
        assert_eq!(strip.height, LINE_STRIP_HEIGHT);
        assert_eq!(strip.left, caret.0 - 160);
        assert_eq!(strip.top, caret.1 - 24);
    }

    #[test]
    fn line_strip_tiny_uia_without_caret_expands_around_uia() {
        let uia = rect(500, 400, 40, 16);
        let strip = line_strip_bounds(Some(uia), None).expect("strip");
        assert_eq!(strip.width, LINE_STRIP_WIDTH);
        assert_eq!(strip.height, LINE_STRIP_HEIGHT);
        let cx = uia.left + uia.width / 2;
        let cy = uia.top + uia.height / 2;
        assert_eq!(strip.left, cx - 160);
        assert_eq!(strip.top, cy - 24);
    }

    #[test]
    fn line_strip_already_line_like_uia_stays_about_same_size() {
        let uia = rect(80, 90, 320, 48);
        let strip = line_strip_bounds(Some(uia), None).expect("strip");
        assert_eq!(strip.left, 80);
        assert_eq!(strip.top, 90);
        assert_eq!(strip.width, 320);
        assert_eq!(strip.height, 48);
    }

    #[test]
    fn line_strip_caret_only_matches_legacy_caret_bounds() {
        let caret = (640, 360);
        let strip = line_strip_bounds(None, Some(caret)).expect("strip");
        assert_eq!(
            strip,
            rect(caret.0 - 160, caret.1 - 24, LINE_STRIP_WIDTH, LINE_STRIP_HEIGHT)
        );
    }

    #[test]
    fn line_strip_neither_uia_nor_caret_returns_none() {
        assert_eq!(line_strip_bounds(None, None), None);
    }

    fn signals(
        control_type: i32,
        value_writable: bool,
        is_chromium_document: bool,
        aria_role: AriaRoleKind,
    ) -> UiaTextInputSignals {
        UiaTextInputSignals {
            control_type,
            value_writable,
            is_chromium_document,
            aria_role,
        }
    }

    #[test]
    fn classify_aria_role_maps_landmarks_and_textboxes() {
        assert_eq!(classify_aria_role("main"), AriaRoleKind::NotText);
        assert_eq!(classify_aria_role("tablist"), AriaRoleKind::NotText);
        assert_eq!(classify_aria_role("textbox"), AriaRoleKind::TextInput);
        assert_eq!(classify_aria_role("searchbox"), AriaRoleKind::TextInput);
        assert_eq!(classify_aria_role("combobox"), AriaRoleKind::ComboBox);
        assert_eq!(classify_aria_role(""), AriaRoleKind::Unspecified);
        assert_eq!(classify_aria_role("TextBox"), AriaRoleKind::TextInput);
    }

    #[test]
    fn editable_class_names_include_common_inputs() {
        assert!(is_editable_class("Edit"));
        assert!(is_editable_class("RichEdit20W"));
        assert!(is_editable_class("RICHEDIT50W"));
        assert!(is_editable_class("RichEditD2DPT"));
        assert!(is_editable_class("Scintilla"));
        assert!(!is_editable_class("Button"));
        assert!(!is_editable_class("Progman"));
        assert!(!is_editable_class("Shell_TrayWnd"));
        assert!(!is_editable_class("Chrome_WidgetWin_1"));
        // Whole-page browser HWNDs are not text fields — UIA must decide.
        assert!(!is_editable_class("Chrome_RenderWidgetHostHWND"));
        assert!(!is_editable_class("Internet Explorer_Server"));
    }

    #[test]
    fn uia_edit_control_is_text_input() {
        assert!(uia_control_is_text_input(signals(
            50004, // UIA_EditControlTypeId
            false,
            false,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_writable_edit_is_text_input() {
        assert!(uia_control_is_text_input(signals(
            50004, // UIA_EditControlTypeId
            true,
            false,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_writable_custom_with_textbox_role_is_text_input() {
        assert!(uia_control_is_text_input(signals(
            50025, // UIA_CustomControlTypeId (contenteditable)
            true,
            false,
            AriaRoleKind::TextInput,
        )));
    }

    #[test]
    fn uia_chromium_contenteditable_document_is_text_input() {
        assert!(uia_control_is_text_input(signals(
            50030, // UIA_DocumentControlTypeId
            true,
            true,
            AriaRoleKind::TextInput,
        )));
    }

    #[test]
    fn uia_youtube_channel_main_landmark_is_not_text_input() {
        // ytd-browse role="main" is a page landmark, not a text field.
        assert!(!uia_control_is_text_input(signals(
            50030, // UIA_DocumentControlTypeId
            true,
            true,
            AriaRoleKind::NotText,
        )));
        assert!(!uia_control_is_text_input(signals(
            50025, // UIA_CustomControlTypeId
            true,
            true,
            AriaRoleKind::NotText,
        )));
    }

    #[test]
    fn uia_chromium_writable_page_without_textbox_role_is_not_text_input() {
        assert!(!uia_control_is_text_input(signals(
            50030,
            true,
            true,
            AriaRoleKind::Unspecified,
        )));
        assert!(!uia_control_is_text_input(signals(
            50025,
            true,
            true,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_static_text_is_not_text_input() {
        assert!(!uia_control_is_text_input(signals(
            50020, // UIA_TextControlTypeId
            false,
            false,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_slider_with_value_pattern_is_not_text_input() {
        assert!(!uia_control_is_text_input(signals(
            50015, // UIA_SliderControlTypeId (YouTube volume)
            true,
            false,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_button_with_value_pattern_is_not_text_input() {
        assert!(!uia_control_is_text_input(signals(
            50000, // UIA_ButtonControlTypeId
            true,
            false,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_word_document_is_text_input_but_chromium_document_is_not() {
        assert!(uia_control_is_text_input(signals(
            50030, // UIA_DocumentControlTypeId
            false,
            false,
            AriaRoleKind::Unspecified,
        )));
        assert!(!uia_control_is_text_input(signals(
            50030,
            false,
            true,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn uia_plain_button_is_not_text_input() {
        assert!(!uia_control_is_text_input(signals(
            50000, // UIA_ButtonControlTypeId
            false,
            false,
            AriaRoleKind::Unspecified,
        )));
    }

    #[test]
    fn classify_aria_role_maps_search_suggestions_as_autocomplete() {
        assert_eq!(
            classify_aria_role("option"),
            AriaRoleKind::AutocompletePopup
        );
        assert_eq!(
            classify_aria_role("listbox"),
            AriaRoleKind::AutocompletePopup
        );
        assert_eq!(
            classify_aria_role("listitem"),
            AriaRoleKind::AutocompletePopup
        );
        assert!(!uia_control_is_text_input(signals(
            50007, // UIA_ListItemControlTypeId
            false,
            true,
            AriaRoleKind::AutocompletePopup,
        )));
        assert!(uia_signals_are_autocomplete_satellite(signals(
            50007,
            false,
            true,
            AriaRoleKind::Unspecified,
        )));
        assert!(uia_signals_are_autocomplete_satellite(signals(
            50000, // button nested inside a suggestion
            false,
            true,
            AriaRoleKind::AutocompletePopup,
        )));
    }

    #[test]
    fn youtube_search_suggestion_keeps_keyboard_after_searchbox() {
        // Hovering a suggestion must not hide the keyboard once the search box showed it.
        assert!(should_retain_text_focus(false, true, true));
        // A listbox on its own must not pop the keyboard.
        assert!(!should_retain_text_focus(false, true, false));
        // Leaving the field for a real non-text control hides it.
        assert!(!should_retain_text_focus(false, false, true));
        assert!(should_retain_text_focus(true, false, false));
    }

    #[test]
    fn last_real_text_focus_expires_after_ttl() {
        let recorded = Instant::now();
        assert!(is_last_real_text_focus_live(
            recorded,
            recorded + Duration::from_secs(1)
        ));
        assert!(!is_last_real_text_focus_live(
            recorded,
            recorded + LAST_REAL_TEXT_FOCUS_TTL + Duration::from_millis(1)
        ));
    }

    #[test]
    fn autocomplete_satellite_requires_remembered_owner() {
        assert!(satellite_matches_remembered_owner(42, 0, Some((42, 100))));
        assert!(satellite_matches_remembered_owner(0, 100, Some((42, 100))));
        assert!(!satellite_matches_remembered_owner(7, 99, Some((42, 100))));
        assert!(!satellite_matches_remembered_owner(42, 100, None));
    }
}
