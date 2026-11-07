//! Keep the `main` panel visible: no minimize style, no taskbar button, restore on hide.

use crate::diagnostics::breadcrumbs;
use std::sync::Mutex;
use tauri::{WebviewWindow, WindowEvent};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, ShowWindow, EVENT_OBJECT_HIDE, EVENT_SYSTEM_MINIMIZESTART, HWND_TOPMOST,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE, WINEVENT_OUTOFCONTEXT,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VisibilityEvent {
    Minimize,
    Hide,
    Other,
}

pub(crate) fn should_restore(event: VisibilityEvent) -> bool {
    matches!(event, VisibilityEvent::Minimize | VisibilityEvent::Hide)
}

struct HookState {
    hwnd: HWND,
    minimize_hook: HWINEVENTHOOK,
    hide_hook: HWINEVENTHOOK,
}

// windows 0.58 types these handles as raw pointers; Win32 HWNDs are process-wide
// and OUTOFCONTEXT callbacks run on a helper thread.
unsafe impl Send for HookState {}

static STATE: Mutex<Option<HookState>> = Mutex::new(None);

fn event_from_win(event: u32) -> VisibilityEvent {
    if event == EVENT_SYSTEM_MINIMIZESTART {
        VisibilityEvent::Minimize
    } else if event == EVENT_OBJECT_HIDE {
        VisibilityEvent::Hide
    } else {
        VisibilityEvent::Other
    }
}

fn restore_now(hwnd: HWND, event: VisibilityEvent) {
    if !should_restore(event) {
        return;
    }
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
        );
    }
    let kind = match event {
        VisibilityEvent::Minimize => "minimize",
        VisibilityEvent::Hide => "hide",
        VisibilityEvent::Other => return,
    };
    breadcrumbs::debug(
        "window::stay_visible",
        format!("stay_visible: restored after {kind}"),
    );
}

pub(crate) fn uninstall() {
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(state) = guard.take() {
        unsafe {
            let _ = UnhookWinEvent(state.minimize_hook);
            let _ = UnhookWinEvent(state.hide_hook);
        }
    }
}

fn hwnd_matches(stored: HWND, incoming: HWND) -> bool {
    stored.0 == incoming.0
}

unsafe extern "system" fn stay_visible_hook(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _id_thread: u32,
    _time: u32,
) {
    if hwnd.0.is_null() || id_object != 0 || id_child != 0 {
        return;
    }
    let visibility = event_from_win(event);
    if !should_restore(visibility) {
        return;
    }
    let stored = {
        let guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().map(|s| s.hwnd)
    };
    let Some(stored) = stored else {
        return;
    };
    if !hwnd_matches(stored, hwnd) {
        return;
    }
    restore_now(hwnd, visibility);
}

pub(crate) fn install_hooks_for_hwnd(hwnd: HWND) -> bool {
    uninstall();
    let minimize_hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_MINIMIZESTART,
            EVENT_SYSTEM_MINIMIZESTART,
            None,
            Some(stay_visible_hook),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    let hide_hook = unsafe {
        SetWinEventHook(
            EVENT_OBJECT_HIDE,
            EVENT_OBJECT_HIDE,
            None,
            Some(stay_visible_hook),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    if minimize_hook.is_invalid() || hide_hook.is_invalid() {
        log::error!("stay_visible: SetWinEventHook failed");
        unsafe {
            if !minimize_hook.is_invalid() {
                let _ = UnhookWinEvent(minimize_hook);
            }
            if !hide_hook.is_invalid() {
                let _ = UnhookWinEvent(hide_hook);
            }
        }
        return false;
    }
    *STATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(HookState {
        hwnd,
        minimize_hook,
        hide_hook,
    });
    true
}

/// Tauri Resized/`is_minimized` backstop is independent of WinEvent hooks.
pub(crate) fn should_register_tauri_backstop(
    hwnd_available: bool,
    _hooks_installed: bool,
) -> bool {
    hwnd_available
}

pub fn install<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let hwnd = match window.hwnd() {
        Ok(raw) => Some(HWND(raw.0)),
        Err(_) => {
            log::error!("stay_visible: main hwnd unavailable");
            None
        }
    };
    let hooks_installed = hwnd.map(install_hooks_for_hwnd).unwrap_or(false);
    if !should_register_tauri_backstop(hwnd.is_some(), hooks_installed) {
        return;
    }

    let window_for_events = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) => {
            if window_for_events.is_minimized().unwrap_or(false) {
                if let Ok(raw) = window_for_events.hwnd() {
                    restore_now(HWND(raw.0), VisibilityEvent::Minimize);
                }
            }
        }
        WindowEvent::Destroyed => uninstall(),
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::{should_register_tauri_backstop, should_restore, VisibilityEvent};

    #[test]
    fn registers_tauri_backstop_when_hwnd_available_even_if_hooks_failed() {
        assert!(should_register_tauri_backstop(true, true));
        assert!(should_register_tauri_backstop(true, false));
    }

    #[test]
    fn skips_tauri_backstop_when_hwnd_unavailable() {
        assert!(!should_register_tauri_backstop(false, true));
        assert!(!should_register_tauri_backstop(false, false));
    }

    #[test]
    fn main_window_config_disables_minimize_and_taskbar() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("tauri.conf.json");
        let windows = conf["app"]["windows"].as_array().expect("app.windows");
        let main = windows
            .iter()
            .find(|w| w["label"] == "main")
            .expect("main window");
        assert_eq!(main["minimizable"], false);
        assert_eq!(main["skipTaskbar"], true);
        assert_eq!(main["maximizable"], false);
        assert_eq!(main["alwaysOnTop"], true);
    }

    #[test]
    fn restores_on_minimize() {
        assert!(should_restore(VisibilityEvent::Minimize));
    }

    #[test]
    fn restores_on_hide() {
        assert!(should_restore(VisibilityEvent::Hide));
    }

    #[test]
    fn does_not_restore_on_other() {
        assert!(!should_restore(VisibilityEvent::Other));
    }

    #[cfg(windows)]
    #[ignore]
    #[test]
    fn minimize_is_restored_on_plain_hwnd() {
        use std::time::{Duration, Instant};
        use windows::core::w;
        use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, IsIconic,
            PeekMessageW, RegisterClassW, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW,
            CW_USEDEFAULT, MSG, PM_REMOVE, SW_MINIMIZE, SW_SHOWNOACTIVATE, WNDCLASSW,
            WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
        };

        unsafe extern "system" fn test_wnd_proc(
            hwnd: HWND,
            msg: u32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT {
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }

        let class_name = w!("ReachPanelStayVisibleTest");
        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(test_wnd_proc),
            lpszClassName: class_name,
            ..Default::default()
        };
        unsafe {
            let _ = RegisterClassW(&class);
        }
        let hwnd = unsafe {
            CreateWindowExW(
                WS_EX_TOPMOST,
                class_name,
                w!("stay-visible-test"),
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                320,
                200,
                None,
                None,
                None,
                None,
            )
        }
        .expect("CreateWindowExW");

        assert!(super::install_hooks_for_hwnd(hwnd));

        unsafe {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
        }

        let started = Instant::now();
        while started.elapsed() < Duration::from_millis(1000) {
            let mut msg = MSG::default();
            unsafe {
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
            if !unsafe { IsIconic(hwnd).as_bool() } {
                break;
            }
            std::thread::sleep(Duration::from_millis(16));
        }

        let iconic = unsafe { IsIconic(hwnd).as_bool() };
        super::uninstall();
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            let _ = DestroyWindow(hwnd);
        }
        assert!(!iconic, "window should be restored after SW_MINIMIZE");
    }
}
