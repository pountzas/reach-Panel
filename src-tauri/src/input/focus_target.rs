use anyhow::Result;
use serde::Serialize;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, Once, OnceLock};
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
    UIA_EditControlTypeId, UIA_ListControlTypeId, UIA_ListItemControlTypeId, UIA_ValuePatternId,
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
        "main"
        | "navigation"
        | "banner"
        | "complementary"
        | "contentinfo"
        | "region"
        | "article"
        | "heading"
        | "document"
        | "application"
        | "button"
        | "tab"
        | "tablist"
        | "link"
        | "img"
        | "image"
        | "slider"
        | "scrollbar"
        | "progressbar"
        | "switch"
        | "checkbox"
        | "radio"
        | "list"
        | "menu"
        | "menuitem"
        | "menubar"
        | "toolbar"
        | "grid"
        | "gridcell"
        | "row"
        | "table"
        | "dialog"
        | "alertdialog"
        | "tooltip"
        | "group"
        | "none"
        | "presentation" => AriaRoleKind::NotText,
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

fn previously_text_focused() -> bool {
    LAST_INPUT_FOCUSED
        .lock()
        .ok()
        .and_then(|guard| *guard)
        == Some(true)
}

fn uia_ancestor_is_autocomplete_satellite(
    automation: &IUIAutomation,
    element: &IUIAutomationElement,
) -> bool {
    let Ok(walker) = (unsafe { automation.ControlViewWalker() }) else {
        return false;
    };
    let mut current = element.clone();
    for _ in 0..12 {
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
        let previously = previously_text_focused();
        let satellite = if is_text || !previously {
            false
        } else {
            uia_signals_are_autocomplete_satellite(signals)
                || uia_ancestor_is_autocomplete_satellite(automation, &element)
        };
        let focused = should_retain_text_focus(is_text, satellite, previously);
        if is_text {
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
    publish_input_focus(is_editable_input_focused());
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
        classify_aria_role, is_editable_class, should_retain_text_focus,
        uia_control_is_text_input, uia_signals_are_autocomplete_satellite, AriaRoleKind,
        UiaTextInputSignals,
    };

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
        assert_eq!(classify_aria_role("option"), AriaRoleKind::AutocompletePopup);
        assert_eq!(classify_aria_role("listbox"), AriaRoleKind::AutocompletePopup);
        assert_eq!(classify_aria_role("listitem"), AriaRoleKind::AutocompletePopup);
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
}
