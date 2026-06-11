use anyhow::{anyhow, Result};
use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEEVENTF_HWHEEL, MOUSEINPUT,
};
use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, SetCursorPos};

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

pub fn move_cursor_relative(dx: i32, dy: i32) -> Result<()> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point)? };
    unsafe { SetCursorPos(point.x + dx, point.y + dy)? };
    Ok(())
}

pub fn move_cursor_absolute(x: i32, y: i32) -> Result<()> {
    unsafe { SetCursorPos(x, y)? };
    Ok(())
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
