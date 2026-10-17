//! Win32 HWND / class / caret helpers for focus targeting.

use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetCaretPos, GetClassNameW, GetForegroundWindow, GetGUIThreadInfo, GetParent,
    GetWindowLongW, GetWindowThreadProcessId, IsWindow, IsWindowVisible, SetForegroundWindow,
    ShowWindow, ES_READONLY, GUITHREADINFO, GWL_STYLE, SW_RESTORE,
};
use anyhow::Result;

pub(super) fn is_null(hwnd: HWND) -> bool {
    hwnd.0.is_null()
}

pub(super) fn hwnd_to_usize(hwnd: HWND) -> usize {
    hwnd.0 as usize
}

pub(super) fn usize_to_hwnd(value: usize) -> HWND {
    HWND(value as *mut core::ffi::c_void)
}

pub(super) fn is_our_window(hwnd: HWND) -> bool {
    if is_null(hwnd) {
        return false;
    }
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        pid == GetCurrentProcessId()
    }
}

pub(super) fn window_class_name(hwnd: HWND) -> String {
    unsafe {
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, &mut buf);
        if len == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }
}

/// Desktop / taskbar (and Win11 XAML tray hosts) are not typing targets.
pub fn is_shell_window_class(class: &str) -> bool {
    matches!(
        class,
        "Progman"
            | "WorkerW"
            | "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "DV2ControlHost"
            | "ForegroundStaging"
            | "ApplicationManager_DesktopShellWindow"
            // Win11 tray / flyout XAML host. Do not list the generic island bridge
            // (Windows.UI.Composition.DesktopWindowContentBridge): XAML-island apps
            // such as Windows Terminal use it too. Taskbar islands are children of
            // Shell_TrayWnd, so the ancestor walk already catches them.
            | "XamlExplorerHostIslandWindow"
    )
}

fn is_shell_window(hwnd: HWND) -> bool {
    is_shell_window_class(&window_class_name(hwnd))
}

/// True when `hwnd` or an ancestor is a shell/taskbar window.
pub(super) fn hwnd_or_ancestor_is_shell(hwnd: HWND) -> bool {
    let mut current = hwnd;
    for _ in 0..12 {
        if is_null(current) {
            break;
        }
        if is_shell_window(current) {
            return true;
        }
        unsafe {
            current = GetParent(current).unwrap_or(HWND::default());
        }
    }
    false
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

pub(super) fn is_readonly_edit(hwnd: HWND, class: &str) -> bool {
    let lower = class.to_ascii_lowercase();
    if lower != "edit" && !lower.starts_with("richedit") {
        return false;
    }
    unsafe {
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        (style & ES_READONLY) != 0
    }
}

pub(super) fn gui_thread_info() -> Option<GUITHREADINFO> {
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

pub(super) fn hwnd_or_ancestor_is_editable(hwnd: HWND) -> bool {
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

pub(super) fn is_chromium_class(class: &str) -> bool {
    class.to_ascii_lowercase().starts_with("chrome_")
}

/// Chromium host detection for classifier signals.
///
/// In-page nodes (e.g. Base UI `<button role="combobox">`) often have
/// `NativeWindowHandle == 0`, so the element's own class is empty. UIA
/// `FrameworkId` is `"Chrome"` for every Chromium node (Chrome/Edge/Electron/
/// WebView2, including WebView2 hosted in non-Chromium top-level windows).
/// Fall back to the element HWND class, then the foreground window class.
pub fn host_is_chromium(framework_id: &str, native_class: &str, foreground_class: &str) -> bool {
    framework_id.eq_ignore_ascii_case("chrome")
        || is_chromium_class(native_class)
        || is_chromium_class(foreground_class)
}

pub(super) fn win32_caret_point() -> Option<(i32, i32)> {
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

pub(super) unsafe fn bring_to_foreground(hwnd: HWND) -> Result<()> {
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

