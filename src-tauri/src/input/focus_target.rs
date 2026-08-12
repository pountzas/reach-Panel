use anyhow::Result;
use serde::Serialize;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, Once, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern, SetWinEventHook,
    HWINEVENTHOOK, UIA_CONTROLTYPE_ID, UIA_ComboBoxControlTypeId, UIA_DocumentControlTypeId,
    UIA_EditControlTypeId, UIA_TextControlTypeId, UIA_ValuePatternId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetClassNameW, GetForegroundWindow, GetGUIThreadInfo, GetParent,
    GetWindowLongW, GetWindowThreadProcessId, IsWindow, IsWindowVisible, SetForegroundWindow,
    ShowWindow, EVENT_OBJECT_FOCUS, EVENT_SYSTEM_FOREGROUND, ES_READONLY, GUITHREADINFO, GWL_STYLE,
    SW_RESTORE, WINEVENT_OUTOFCONTEXT,
};

static TARGET_HWND: Mutex<Option<usize>> = Mutex::new(None);
static HOOK_ONCE: Once = Once::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LAST_INPUT_FOCUSED: Mutex<Option<bool>> = Mutex::new(None);
/// Coalesce deferred focus reevals; never call UIA inside a WinEvent hook.
static REEVAL_WORKER_BUSY: AtomicBool = AtomicBool::new(false);
static REEVAL_DIRTY: AtomicBool = AtomicBool::new(false);

thread_local! {
    static UIA_LOCAL: RefCell<Option<IUIAutomation>> = const { RefCell::new(None) };
}

/// Signals used to decide whether a UIA-focused control accepts text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UiaTextInputSignals {
    pub control_type: i32,
    pub value_writable: bool,
    /// Chromium reports a page-level Document even when no text field is focused.
    pub is_chromium_document: bool,
}

/// Pure classifier for UIA control signals (unit-tested without live UIA).
pub fn uia_control_is_text_input(signals: UiaTextInputSignals) -> bool {
    if signals.value_writable {
        return true;
    }
    let ty = UIA_CONTROLTYPE_ID(signals.control_type);
    if ty == UIA_EditControlTypeId || ty == UIA_TextControlTypeId {
        return true;
    }
    if ty == UIA_DocumentControlTypeId {
        // Word / editors: Document is the typing surface.
        // Chromium page body is also Document — ignore unless ValuePattern is writable.
        return !signals.is_chromium_document;
    }
    if ty == UIA_ComboBoxControlTypeId {
        // Non-editable combo boxes are not text inputs; writable ValuePattern handled above.
        return false;
    }
    false
}

#[derive(Debug, Clone, Serialize)]
struct FocusChangedPayload {
    focused: bool,
}

pub fn init(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
    install_hooks();
    reevaluate_input_focus();
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

/// Heuristic: Win32 / browser / editor class names that typically accept text input.
pub fn is_editable_class(class: &str) -> bool {
    let lower = class.to_ascii_lowercase();
    if lower == "edit" || lower == "editcomctl32" {
        return true;
    }
    if lower.starts_with("richedit") {
        return true;
    }
    if lower.starts_with("chrome_renderwidgethosthwnd") {
        return true;
    }
    matches!(
        lower.as_str(),
        "internet explorer_server"
            | "scintilla"
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
    let lower = class.to_ascii_lowercase();
    lower.starts_with("chrome_") || lower.starts_with("chrome_widgetwin")
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
        };
        let focused = uia_control_is_text_input(signals);
        if focused {
            remember_uia_focus_target(&element);
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
        // UIA answered "not a text field" — still allow Win32 heuristics below
        // for apps with incomplete UIA trees (e.g. some legacy editors).
    }

    unsafe {
        let fg = GetForegroundWindow();
        if !is_valid_typing_target(fg) {
            return false;
        }

        let Some(info) = gui_thread_info() else {
            return hwnd_or_ancestor_is_editable(fg) || is_editable_class(&window_class_name(fg));
        };

        // Caret in another process is a strong signal of text entry.
        if !is_null(info.hwndCaret) && !is_our_window(info.hwndCaret) {
            let caret_class = window_class_name(info.hwndCaret);
            if !is_readonly_edit(info.hwndCaret, &caret_class) {
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
    publish_input_focus(is_editable_input_focused());
}

/// Schedule focus reevaluation off the WinEvent callback stack.
/// Calling UI Automation inside a hook re-enters the message loop and can abort
/// the process (STATUS_STACK_BUFFER_OVERRUN) — see GetFocusedElement crash.
fn schedule_reevaluate_input_focus() {
    REEVAL_DIRTY.store(true, Ordering::Release);
    if REEVAL_WORKER_BUSY.swap(true, Ordering::AcqRel) {
        return;
    }
    thread::spawn(|| {
        loop {
            // Leave the WinEvent / message-callback stack before touching UIA.
            thread::sleep(Duration::from_millis(32));
            REEVAL_DIRTY.store(false, Ordering::Release);
            reevaluate_input_focus();
            if !REEVAL_DIRTY.load(Ordering::Acquire) {
                REEVAL_WORKER_BUSY.store(false, Ordering::Release);
                // If a hook marked dirty after we cleared busy, start another worker.
                if REEVAL_DIRTY.load(Ordering::Acquire)
                    && !REEVAL_WORKER_BUSY.swap(true, Ordering::AcqRel)
                {
                    continue;
                }
                break;
            }
        }
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
    use super::{is_editable_class, uia_control_is_text_input, UiaTextInputSignals};

    #[test]
    fn editable_class_names_include_common_inputs() {
        assert!(is_editable_class("Edit"));
        assert!(is_editable_class("RichEdit20W"));
        assert!(is_editable_class("RICHEDIT50W"));
        assert!(is_editable_class("RichEditD2DPT"));
        assert!(is_editable_class("Chrome_RenderWidgetHostHWND"));
        assert!(is_editable_class("Internet Explorer_Server"));
        assert!(is_editable_class("Scintilla"));
        assert!(!is_editable_class("Button"));
        assert!(!is_editable_class("Progman"));
        assert!(!is_editable_class("Shell_TrayWnd"));
        assert!(!is_editable_class("Chrome_WidgetWin_1"));
    }

    #[test]
    fn uia_edit_control_is_text_input() {
        assert!(uia_control_is_text_input(UiaTextInputSignals {
            control_type: 50004, // UIA_EditControlTypeId
            value_writable: false,
            is_chromium_document: false,
        }));
    }

    #[test]
    fn uia_writable_value_pattern_is_text_input() {
        assert!(uia_control_is_text_input(UiaTextInputSignals {
            control_type: 50000, // button / custom — ValuePattern decides
            value_writable: true,
            is_chromium_document: false,
        }));
    }

    #[test]
    fn uia_word_document_is_text_input_but_chromium_document_is_not() {
        assert!(uia_control_is_text_input(UiaTextInputSignals {
            control_type: 50030, // UIA_DocumentControlTypeId
            value_writable: false,
            is_chromium_document: false,
        }));
        assert!(!uia_control_is_text_input(UiaTextInputSignals {
            control_type: 50030,
            value_writable: false,
            is_chromium_document: true,
        }));
    }

    #[test]
    fn uia_plain_button_is_not_text_input() {
        assert!(!uia_control_is_text_input(UiaTextInputSignals {
            control_type: 50000, // UIA_ButtonControlTypeId
            value_writable: false,
            is_chromium_document: false,
        }));
    }
}
