//! UI Automation focus classification and element queries.

use super::win32::{hwnd_to_usize, is_null, window_class_name};
use super::ScreenRect;
use std::cell::RefCell;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::BOOL;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, SAFEARRAY,
};
use windows::Win32::System::Ole::{
    SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetUBound, SafeArrayUnaccessData,
};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern,
    IUIAutomationTextPattern2, IUIAutomationTextRange, IUIAutomationValuePattern,
    TextPatternRangeEndpoint_End, TextPatternRangeEndpoint_Start, TextUnit_Character,
    UIA_ButtonControlTypeId, UIA_ComboBoxControlTypeId, UIA_CustomControlTypeId,
    UIA_DocumentControlTypeId, UIA_EditControlTypeId, UIA_GroupControlTypeId,
    UIA_IsReadOnlyAttributeId, UIA_ListControlTypeId, UIA_ListItemControlTypeId,
    UIA_SpinnerControlTypeId, UIA_TextPattern2Id, UIA_TextPatternId, UIA_ValuePatternId,
    UIA_CONTROLTYPE_ID,
};

/// How long a real text field can "lend" focus to an autocomplete popup.
pub const LAST_REAL_TEXT_FOCUS_TTL: Duration = Duration::from_secs(30);
const AUTOCOMPLETE_ANCESTOR_WALK_DEPTH: usize = 6;

struct LastRealTextFocus {
    process_id: u32,
    hwnd: usize,
    at: Instant,
}

static LAST_REAL_TEXT_FOCUS: Mutex<Option<LastRealTextFocus>> = Mutex::new(None);
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
    /// True when TextPattern or TextPattern2 is available (contenteditable hosts).
    pub has_text_pattern: bool,
    /// TextPattern document range is editable (`IsReadOnly` is false / unavailable).
    /// Independent of ValuePattern — Chromium contenteditable Groups often lack ValuePattern.
    pub text_pattern_editable: bool,
}

/// Maps an ARIA role string from UIA (`CurrentAriaRole`) to a classifier bucket.
pub fn classify_aria_role(role: &str) -> AriaRoleKind {
    match role.trim().to_ascii_lowercase().as_str() {
        "" => AriaRoleKind::Unspecified,
        // spinbutton: HTML <input type="number"> / ARIA spinbutton (UIA Spinner).
        "textbox" | "searchbox" | "spinbutton" => AriaRoleKind::TextInput,
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

/// Comboboxes accept typing only when they expose an editable TextPattern
/// (editable combobox `<input>`). Chromium reports select-only comboboxes
/// (`<select>`, `role=combobox` div/button) with a writable ValuePattern, so
/// ValuePattern alone is only trusted for non-Chromium hosts — and never for
/// Button triggers (Base UI / Radix / shadcn Select), which are select-only.
pub fn combo_box_accepts_text(signals: UiaTextInputSignals) -> bool {
    if signals.has_text_pattern && signals.text_pattern_editable {
        return true;
    }
    if UIA_CONTROLTYPE_ID(signals.control_type) == UIA_ButtonControlTypeId {
        return false;
    }
    signals.value_writable && !signals.is_chromium_document
}

/// Pure classifier for UIA control signals (unit-tested without live UIA).
pub fn uia_control_is_text_input(signals: UiaTextInputSignals) -> bool {
    let ty = UIA_CONTROLTYPE_ID(signals.control_type);

    // Chromium contenteditable roots (YouTube comments, etc.) are exposed as
    // Group with aria role "group" plus TextPattern — not Edit/textbox.
    // Require TextPattern editability (not ValuePattern) before the NotText reject.
    if signals.has_text_pattern && signals.text_pattern_editable && ty == UIA_GroupControlTypeId {
        return true;
    }
    // Some hosts use Custom + TextPattern for the same pattern; still reject
    // hard landmarks (main/button/…) that happen to expose TextPattern.
    // Match the Group rule: require editability so read-only Custom text is rejected.
    if signals.has_text_pattern
        && signals.text_pattern_editable
        && ty == UIA_CustomControlTypeId
        && !matches!(
            signals.aria_role,
            AriaRoleKind::NotText | AriaRoleKind::AutocompletePopup
        )
    {
        return true;
    }

    match signals.aria_role {
        AriaRoleKind::NotText | AriaRoleKind::AutocompletePopup => return false,
        AriaRoleKind::TextInput => return true,
        AriaRoleKind::ComboBox => return combo_box_accepts_text(signals),
        AriaRoleKind::Unspecified => {}
    }

    if ty == UIA_EditControlTypeId {
        return true;
    }
    // HTML <input type="number"> is Spinner (not Edit). Accept when writable or
    // when TextPattern says the field is editable.
    if ty == UIA_SpinnerControlTypeId {
        return signals.value_writable
            || (signals.has_text_pattern && signals.text_pattern_editable);
    }
    if ty == UIA_DocumentControlTypeId {
        // Word / native editors: Document is the typing surface.
        // Chromium page Documents are usually not — except designMode /
        // contenteditable iframe editors (TinyMCE, CKEditor 4) with editable TextPattern.
        return !signals.is_chromium_document
            || (signals.has_text_pattern && signals.text_pattern_editable);
    }
    if ty == UIA_ComboBoxControlTypeId {
        return combo_box_accepts_text(signals);
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

pub(super) fn live_last_real_text_focus() -> Option<(u32, usize)> {
    let guard = LAST_REAL_TEXT_FOCUS.lock().ok()?;
    let last = guard.as_ref()?;
    if !is_last_real_text_focus_live(last.at, Instant::now()) {
        return None;
    }
    Some((last.process_id, last.hwnd))
}

pub(super) fn previously_text_focused() -> bool {
    live_last_real_text_focus().is_some()
}

pub(super) fn note_text_focus(element: &IUIAutomationElement) {
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

pub(super) fn clear_last_real_text_focus() {
    if let Ok(mut slot) = LAST_REAL_TEXT_FOCUS.lock() {
        *slot = None;
    }
}

pub(super) fn uia_element_process_id(element: &IUIAutomationElement) -> u32 {
    unsafe { element.CurrentProcessId().ok().map(|pid| pid as u32) }.unwrap_or(0)
}

pub(super) fn uia_element_hwnd_usize(element: &IUIAutomationElement) -> usize {
    unsafe {
        element
            .CurrentNativeWindowHandle()
            .ok()
            .filter(|hwnd| !is_null(*hwnd))
            .map(hwnd_to_usize)
            .unwrap_or(0)
    }
}

pub(super) fn uia_element_belongs_to_remembered_text_focus(element: &IUIAutomationElement) -> bool {
    satellite_matches_remembered_owner(
        uia_element_process_id(element),
        uia_element_hwnd_usize(element),
        live_last_real_text_focus(),
    )
}

pub(super) fn uia_ancestor_is_autocomplete_satellite(
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

pub(super) fn ensure_com_for_uia() {
    // Per-thread: CoInitializeEx is required on each thread that uses COM/UIA.
    // S_FALSE / RPC_E_CHANGED_MODE are fine if already initialized.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

pub(super) fn with_uia<F, R>(f: F) -> Option<R>
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

pub(super) fn uia_element_is_our_process(element: &IUIAutomationElement) -> bool {
    unsafe {
        match element.CurrentProcessId() {
            Ok(pid) => pid as u32 == GetCurrentProcessId(),
            Err(_) => false,
        }
    }
}

pub(super) fn uia_element_native_class(element: &IUIAutomationElement) -> String {
    unsafe {
        let hwnd = element.CurrentNativeWindowHandle().unwrap_or_default();
        if is_null(hwnd) {
            String::new()
        } else {
            window_class_name(hwnd)
        }
    }
}

pub(super) fn uia_element_framework_id(element: &IUIAutomationElement) -> String {
    unsafe {
        element
            .CurrentFrameworkId()
            .map(|b| b.to_string())
            .unwrap_or_default()
    }
}

pub(super) fn uia_element_aria_role(element: &IUIAutomationElement) -> AriaRoleKind {
    unsafe {
        let role = match element.CurrentAriaRole() {
            Ok(bstr) => bstr.to_string(),
            Err(_) => String::new(),
        };
        classify_aria_role(&role)
    }
}

pub(super) fn uia_element_value_writable(element: &IUIAutomationElement) -> bool {
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

pub(super) fn uia_element_has_text_pattern(element: &IUIAutomationElement) -> bool {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationTextPattern2>(UIA_TextPattern2Id)
            .is_ok()
            || element
                .GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
                .is_ok()
    }
}

/// True when TextPattern's document range is not read-only.
///
/// Falls open when the attribute is Mixed/unavailable so Chromium contenteditable
/// Groups that lack ValuePattern still count as editable.
pub(super) fn uia_element_text_pattern_editable(element: &IUIAutomationElement) -> bool {
    unsafe {
        let range = if let Ok(pattern2) =
            element.GetCurrentPatternAs::<IUIAutomationTextPattern2>(UIA_TextPattern2Id)
        {
            pattern2.DocumentRange().ok()
        } else if let Ok(pattern) =
            element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
        {
            pattern.DocumentRange().ok()
        } else {
            None
        };
        let Some(range) = range else {
            return false;
        };
        match range.GetAttributeValue(UIA_IsReadOnlyAttributeId) {
            Ok(value) => match bool::try_from(&value) {
                Ok(readonly) => !readonly,
                Err(_) => true,
            },
            Err(_) => true,
        }
    }
}

pub(super) fn uia_element_bounds(element: &IUIAutomationElement) -> Option<ScreenRect> {
    unsafe {
        let rect = element.CurrentBoundingRectangle().ok()?;
        ScreenRect::from_win32(rect)
    }
}

pub(super) fn uia_caret_point(element: &IUIAutomationElement) -> Option<(i32, i32)> {
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

pub(super) fn text_range_caret_point(range: &IUIAutomationTextRange) -> Option<(i32, i32)> {
    if let Some(pt) = bounding_rect_center(range) {
        return Some(pt);
    }
    unsafe {
        let probe = range.Clone().ok()?;
        let moved = probe
            .MoveEndpointByUnit(TextPatternRangeEndpoint_End, TextUnit_Character, 1)
            .unwrap_or(0);
        if moved == 0 {
            let _ =
                probe.MoveEndpointByUnit(TextPatternRangeEndpoint_Start, TextUnit_Character, -1);
        }
        bounding_rect_center(&probe)
    }
}

pub(super) fn bounding_rect_center(range: &IUIAutomationTextRange) -> Option<(i32, i32)> {
    unsafe {
        let psa = range.GetBoundingRectangles().ok()?;
        first_rect_center(psa)
    }
}

pub(super) fn first_rect_center(psa: *mut SAFEARRAY) -> Option<(i32, i32)> {
    if psa.is_null() {
        return None;
    }
    unsafe {
        let mut data: *mut std::ffi::c_void = std::ptr::null_mut();
        let accessed = SafeArrayAccessData(psa, &mut data).is_ok();
        let result = if accessed && !data.is_null() {
            match SafeArrayGetUBound(psa, 1) {
                Ok(ubound) if ubound >= 3 => {
                    let vals =
                        std::slice::from_raw_parts(data as *const f64, (ubound + 1) as usize);
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

