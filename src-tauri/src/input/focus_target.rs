use anyhow::Result;
use std::sync::{Mutex, Once};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentProcessId, GetCurrentThreadId};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EVENT_SYSTEM_FOREGROUND, GetForegroundWindow, GetWindowThreadProcessId,
    IsWindow, SetForegroundWindow, ShowWindow, SW_RESTORE, WINEVENT_OUTOFCONTEXT,
};

static TARGET_HWND: Mutex<Option<usize>> = Mutex::new(None);
static HOOK_ONCE: Once = Once::new();

pub fn init() {
    install_hook();
    remember_current_if_external();
}

fn install_hook() {
    HOOK_ONCE.call_once(|| {
        unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(foreground_hook),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            if !hook.is_invalid() {
                std::mem::forget(hook);
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
    if is_our_window(hwnd) {
        return;
    }
    if let Ok(mut target) = TARGET_HWND.lock() {
        *target = Some(hwnd_to_usize(hwnd));
    }
}

pub fn get_effective_input_hwnd() -> Option<HWND> {
    unsafe {
        let fg = GetForegroundWindow();
        if !is_null(fg) && !is_our_window(fg) {
            return Some(fg);
        }
        let target = TARGET_HWND.lock().ok().and_then(|g| *g)?;
        let hwnd = usize_to_hwnd(target);
        if IsWindow(hwnd).as_bool() {
            Some(hwnd)
        } else {
            None
        }
    }
}

pub fn remember_current_if_external() {
    unsafe {
        let fg = GetForegroundWindow();
        if is_null(fg) || is_our_window(fg) {
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
        if !IsWindow(hwnd).as_bool() {
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
