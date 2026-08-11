use anyhow::{anyhow, Result};
use std::sync::Mutex;
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEEVENTF_HWHEEL, MOUSEINPUT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetSystemMetrics, GetWindowRect, SetCursorPos, SM_CXVIRTUALSCREEN,
    SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

struct TrackpadGestureState {
    active: bool,
    last_good: Option<(i32, i32)>,
}

impl Default for TrackpadGestureState {
    fn default() -> Self {
        Self {
            active: false,
            last_good: None,
        }
    }
}

static TRACKPAD_GESTURE: Mutex<TrackpadGestureState> = Mutex::new(TrackpadGestureState {
    active: false,
    last_good: None,
});

fn send_mouse(flags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS, data: i32) -> Result<()> {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
    if sent == 0 {
        return Err(anyhow!("SendInput mouse failed"));
    }
    Ok(())
}

fn virtual_screen_bounds() -> (i32, i32, i32, i32) {
    unsafe {
        let left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        (left, top, left + width.saturating_sub(1), top + height.saturating_sub(1))
    }
}

fn clamp_to_virtual_screen(x: i32, y: i32) -> (i32, i32) {
    let (left, top, right, bottom) = virtual_screen_bounds();
    (x.clamp(left, right), y.clamp(top, bottom))
}

fn set_cursor_and_remember(x: i32, y: i32, state: &mut TrackpadGestureState) -> Result<()> {
    let (x, y) = clamp_to_virtual_screen(x, y);
    unsafe { SetCursorPos(x, y)? };
    state.last_good = Some((x, y));
    Ok(())
}

fn point_in_window(hwnd: isize, point: POINT) -> bool {
    if hwnd == 0 {
        return false;
    }
    let mut rect = RECT::default();
    let ok = unsafe { GetWindowRect(HWND(hwnd as *mut core::ffi::c_void), &mut rect) };
    if ok.is_err() {
        return false;
    }
    point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom
}

/// Start a trackpad drag session. If Windows has already moved the cursor onto our
/// window (typical for touch), keep the last intentional position instead.
pub fn begin_trackpad_gesture(app_hwnd: isize) -> Result<()> {
    let mut state = TRACKPAD_GESTURE
        .lock()
        .map_err(|_| anyhow!("trackpad gesture lock poisoned"))?;

    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point)? };

    if point_in_window(app_hwnd, point) {
        if state.last_good.is_none() {
            // No prior injected position; fall back to OS cursor.
            state.last_good = Some((point.x, point.y));
        }
    } else {
        state.last_good = Some((point.x, point.y));
    }

    state.active = true;
    Ok(())
}

pub fn end_trackpad_gesture() -> Result<()> {
    let mut state = TRACKPAD_GESTURE
        .lock()
        .map_err(|_| anyhow!("trackpad gesture lock poisoned"))?;
    state.active = false;
    Ok(())
}

pub fn move_cursor_relative(dx: i32, dy: i32) -> Result<()> {
    let mut state = TRACKPAD_GESTURE
        .lock()
        .map_err(|_| anyhow!("trackpad gesture lock poisoned"))?;

    if state.active {
        let (base_x, base_y) = match state.last_good {
            Some(pos) => pos,
            None => {
                let mut point = POINT::default();
                unsafe { GetCursorPos(&mut point)? };
                (point.x, point.y)
            }
        };
        return set_cursor_and_remember(base_x + dx, base_y + dy, &mut state);
    }

    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point)? };
    set_cursor_and_remember(point.x + dx, point.y + dy, &mut state)
}

pub fn move_cursor_absolute(x: i32, y: i32) -> Result<()> {
    let mut state = TRACKPAD_GESTURE
        .lock()
        .map_err(|_| anyhow!("trackpad gesture lock poisoned"))?;
    set_cursor_and_remember(x, y, &mut state)
}

pub fn get_cursor_position() -> Result<(i32, i32)> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point)? };
    Ok((point.x, point.y))
}

pub fn mouse_click(button: &str) -> Result<()> {
    let (down, up) = match button.to_lowercase().as_str() {
        "left" => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        _ => return Err(anyhow!("Unknown mouse button: {button}")),
    };
    send_mouse(down, 0)?;
    send_mouse(up, 0)?;
    Ok(())
}

pub fn mouse_double_click() -> Result<()> {
    mouse_click("left")?;
    mouse_click("left")?;
    Ok(())
}

pub fn mouse_scroll(delta: i32, horizontal: bool) -> Result<()> {
    let flags = if horizontal { MOUSEEVENTF_HWHEEL } else { MOUSEEVENTF_WHEEL };
    send_mouse(flags, delta)?;
    Ok(())
}
