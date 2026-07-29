use super::focus_target::{get_effective_input_hwnd, with_target_focus};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, GetKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_BACK, VK_CAPITAL, VK_CONTROL, VK_DELETE,
    VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_HOME, VK_LMENU, VK_LWIN, VK_LEFT, VK_NEXT, VK_PRIOR,
    VK_RETURN, VK_RIGHT, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};

#[derive(Debug, Deserialize)]
pub struct KeyPressRequest {
    pub key: String,
    pub modifiers: Vec<String>,
}

fn modifier_vk(name: &str) -> Option<VIRTUAL_KEY> {
    match name.to_lowercase().as_str() {
        "shift" => Some(VK_SHIFT),
        "ctrl" | "control" => Some(VK_CONTROL),
        "alt" => Some(VK_LMENU),
        "win" | "meta" => Some(VK_LWIN),
        _ => None,
    }
}

fn special_vk(key: &str) -> Option<VIRTUAL_KEY> {
    match key.to_lowercase().as_str() {
        "enter" | "return" => Some(VK_RETURN),
        "backspace" => Some(VK_BACK),
        "tab" => Some(VK_TAB),
        "space" => Some(VK_SPACE),
        "escape" | "esc" => Some(VK_ESCAPE),
        "delete" => Some(VK_DELETE),
        "home" => Some(VK_HOME),
        "end" => Some(VK_END),
        "pageup" => Some(VK_PRIOR),
        "pagedown" => Some(VK_NEXT),
        "up" => Some(VK_UP),
        "down" => Some(VK_DOWN),
        "left" => Some(VK_LEFT),
        "right" => Some(VK_RIGHT),
        "capslock" => Some(VK_CAPITAL),
        "f1" => Some(VK_F1),
        _ => None,
    }
}

fn send_vk(vk: VIRTUAL_KEY, key_up: bool) -> Result<()> {
    let flags = if key_up { KEYEVENTF_KEYUP } else { Default::default() };
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
    if sent == 0 {
        return Err(anyhow!("SendInput failed for virtual key"));
    }
    Ok(())
}

fn send_unicode(ch: char) -> Result<()> {
    let code = ch as u16;
    let down = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: code,
                dwFlags: KEYEVENTF_UNICODE,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let up = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: code,
                dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let sent = unsafe { SendInput(&[down, up], std::mem::size_of::<INPUT>() as i32) };
    if sent == 0 {
        return Err(anyhow!("SendInput failed for unicode"));
    }
    Ok(())
}

fn char_to_vk(ch: char) -> Option<VIRTUAL_KEY> {
    let upper = ch.to_ascii_uppercase();
    if upper.is_ascii_alphabetic() {
        return Some(VIRTUAL_KEY(upper as u16));
    }
    if upper.is_ascii_digit() {
        return Some(VIRTUAL_KEY(upper as u16));
    }
    match ch {
        '-' => Some(VIRTUAL_KEY(0xBD)),
        '=' => Some(VIRTUAL_KEY(0xBB)),
        '[' => Some(VIRTUAL_KEY(0xDB)),
        ']' => Some(VIRTUAL_KEY(0xDD)),
        '\\' => Some(VIRTUAL_KEY(0xDC)),
        ';' => Some(VIRTUAL_KEY(0xBA)),
        '\'' => Some(VIRTUAL_KEY(0xDE)),
        ',' => Some(VIRTUAL_KEY(0xBC)),
        '.' => Some(VIRTUAL_KEY(0xBE)),
        '/' => Some(VIRTUAL_KEY(0xBF)),
        '`' => Some(VIRTUAL_KEY(0xC0)),
        _ => None,
    }
}

pub fn press_key(request: KeyPressRequest) -> Result<()> {
    with_target_focus(|| press_key_impl(request))
}

fn press_key_impl(request: KeyPressRequest) -> Result<()> {
    let key = request.key.trim();
    if key.is_empty() {
        return Err(anyhow!("Empty key"));
    }

    for modifier in &request.modifiers {
        if let Some(vk) = modifier_vk(modifier) {
            send_vk(vk, false)?;
        }
    }

    if key.len() == 1 {
        let ch = key.chars().next().unwrap();
        if ch.is_ascii() {
            if let Some(vk) = char_to_vk(ch) {
                let needs_shift = ch.is_ascii_uppercase()
                    || matches!(ch, '!' | '@' | '#' | '$' | '%' | '^' | '&' | '*' | '(' | ')');
                if needs_shift && !request.modifiers.iter().any(|m| m.eq_ignore_ascii_case("shift")) {
                    send_vk(VK_SHIFT, false)?;
                    send_vk(vk, false)?;
                    send_vk(vk, true)?;
                    send_vk(VK_SHIFT, true)?;
                } else {
                    send_vk(vk, false)?;
                    send_vk(vk, true)?;
                }
            } else {
                send_unicode(ch)?;
            }
        } else {
            send_unicode(ch)?;
        }
    } else if let Some(vk) = special_vk(key) {
        send_vk(vk, false)?;
        send_vk(vk, true)?;
    } else if key.starts_with("F") && key.len() <= 3 {
        if let Ok(num) = key[1..].parse::<u16>() {
            if (1..=24).contains(&num) {
                send_vk(VIRTUAL_KEY(0x70 + num - 1), false)?;
                send_vk(VIRTUAL_KEY(0x70 + num - 1), true)?;
            }
        }
    } else {
        for ch in key.chars() {
            send_unicode(ch)?;
        }
    }

    for modifier in request.modifiers.iter().rev() {
        if let Some(vk) = modifier_vk(modifier) {
            send_vk(vk, true)?;
        }
    }

    Ok(())
}

pub fn type_text(text: &str) -> Result<()> {
    with_target_focus(|| type_text_impl(text))
}

fn type_text_impl(text: &str) -> Result<()> {
    for ch in text.chars() {
        if ch == '\n' {
            send_vk(VK_RETURN, false)?;
            send_vk(VK_RETURN, true)?;
        } else if ch.is_ascii() {
            if let Some(vk) = char_to_vk(ch) {
                let needs_shift = ch.is_ascii_uppercase();
                if needs_shift {
                    send_vk(VK_SHIFT, false)?;
                }
                send_vk(vk, false)?;
                send_vk(vk, true)?;
                if needs_shift {
                    send_vk(VK_SHIFT, true)?;
                }
            } else {
                send_unicode(ch)?;
            }
        } else {
            send_unicode(ch)?;
        }
    }
    Ok(())
}

pub fn press_combo(keys: Vec<String>) -> Result<()> {
    with_target_focus(|| press_combo_impl(keys))
}

fn press_combo_impl(keys: Vec<String>) -> Result<()> {
    let mut vks: Vec<VIRTUAL_KEY> = Vec::new();
    for key in &keys {
        if let Some(vk) = modifier_vk(key) {
            vks.push(vk);
        } else if let Some(vk) = special_vk(key) {
            vks.push(vk);
        } else if key.len() == 1 {
            if let Some(vk) = char_to_vk(key.chars().next().unwrap()) {
                vks.push(vk);
            }
        }
    }
    for vk in &vks {
        send_vk(*vk, false)?;
    }
    for vk in vks.iter().rev() {
        send_vk(*vk, true)?;
    }
    Ok(())
}

pub fn press_media_key(key: &str) -> Result<()> {
    let vk = match key.to_lowercase().as_str() {
        "volumeup" => VIRTUAL_KEY(0xAF),
        "volumedown" => VIRTUAL_KEY(0xAE),
        "volumemute" => VIRTUAL_KEY(0xAD),
        "playpause" => VIRTUAL_KEY(0xB3),
        "stop" => VIRTUAL_KEY(0xB2),
        "nexttrack" => VIRTUAL_KEY(0xB0),
        "prevtrack" => VIRTUAL_KEY(0xB1),
        _ => return Err(anyhow!("Unknown media key: {key}")),
    };
    send_vk(vk, false)?;
    send_vk(vk, true)?;
    Ok(())
}

pub fn get_caps_lock_state() -> bool {
    unsafe { GetKeyState(VK_CAPITAL.0 as i32) & 0x0001 != 0 }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardState {
    pub caps_lock: bool,
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub win: bool,
    pub pressed_vks: Vec<u16>,
    pub system_language: String,
    pub keyboard_layout: String,
    /// True when an external target window is available for typing / language switch.
    pub has_input_target: bool,
}

fn is_async_key_down(vk: i32) -> bool {
    unsafe { GetAsyncKeyState(vk) as u16 & 0x8000 != 0 }
}

pub fn get_keyboard_state() -> KeyboardState {
    let mut pressed_vks = Vec::new();
    for vk in 0x30..=0x39 {
        if is_async_key_down(vk) {
            pressed_vks.push(vk as u16);
        }
    }
    for vk in 0x41..=0x5A {
        if is_async_key_down(vk) {
            pressed_vks.push(vk as u16);
        }
    }
    for vk in [
        0x08, 0x09, 0x0D, 0x10, 0xA0, 0xA1, 0x11, 0xA2, 0xA3, 0x12, 0xA4, 0xA5, 0x14, 0x20,
        0x5B, 0x5C, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xC0, 0xDB, 0xDC, 0xDD, 0xDE,
    ] {
        if is_async_key_down(vk) {
            pressed_vks.push(vk as u16);
        }
    }
    pressed_vks.sort_unstable();
    pressed_vks.dedup();

    let has_input_target = super::focus_target::has_input_target();
    let (lang_id, keyboard_layout) = active_input_locale();
    KeyboardState {
        caps_lock: get_caps_lock_state(),
        shift: is_async_key_down(0x10) || is_async_key_down(0xA0) || is_async_key_down(0xA1),
        ctrl: is_async_key_down(0x11) || is_async_key_down(0xA2) || is_async_key_down(0xA3),
        alt: is_async_key_down(0x12) || is_async_key_down(0xA4) || is_async_key_down(0xA5),
        win: is_async_key_down(0x5B) || is_async_key_down(0x5C),
        pressed_vks,
        system_language: lang_id_to_app_language(lang_id),
        keyboard_layout,
        has_input_target,
    }
}

fn active_input_locale() -> (u32, String) {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetKeyboardLayout;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    // Prefer a real typing target; fall back to foreground so Alt+Shift in the
    // focused app still updates our on-screen layout.
    let hwnd = match get_effective_input_hwnd() {
        Some(hwnd) => hwnd,
        None => unsafe { GetForegroundWindow() },
    };
    if hwnd.0.is_null() {
        return (0x0409, "QWERTY".to_string());
    }
    unsafe {
        let thread_id = GetWindowThreadProcessId(hwnd, None);
        let layout = GetKeyboardLayout(thread_id);
        let lang_id = (layout.0 as u32) & 0xFFFF;
        (lang_id, lang_id_to_layout_name(lang_id))
    }
}

pub fn lang_id_to_app_language(lang_id: u32) -> String {
    match lang_id & 0x3FF {
        0x08 => "el".to_string(),
        0x09 => "en".to_string(),
        _ => "en".to_string(),
    }
}

fn lang_id_to_layout_name(lang_id: u32) -> String {
    match lang_id {
        0x0409 => "QWERTY".to_string(),
        0x040C => "AZERTY".to_string(),
        0x0408 => "Greek".to_string(),
        0x0407 => "QWERTZ".to_string(),
        _ => format!("Layout-{lang_id:04X}"),
    }
}

pub fn get_keyboard_layout() -> String {
    active_input_locale().1
}

fn find_installed_layout(target_primary: u32) -> Option<windows::Win32::UI::Input::KeyboardAndMouse::HKL> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayoutList, HKL};

    unsafe {
        let count = GetKeyboardLayoutList(None);
        if count <= 0 {
            return None;
        }
        let mut list = vec![HKL::default(); count as usize];
        let count = GetKeyboardLayoutList(Some(&mut list));
        if count <= 0 {
            return None;
        }
        for hkl in &list[..count as usize] {
            let lang_id = (hkl.0 as u32) & 0xFFFF;
            if (lang_id & 0x3FF) == target_primary {
                return Some(*hkl);
            }
        }
    }
    None
}

fn load_layout_for_language(lang: &str) -> Result<windows::Win32::UI::Input::KeyboardAndMouse::HKL> {
    use windows::core::w;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        LoadKeyboardLayoutW, ACTIVATE_KEYBOARD_LAYOUT_FLAGS,
    };

    let klid = match lang {
        "el" => w!("00000408"),
        _ => w!("00000409"),
    };
    unsafe {
        LoadKeyboardLayoutW(klid, ACTIVATE_KEYBOARD_LAYOUT_FLAGS(0x00000001))
            .map_err(|_| anyhow!("Failed to load keyboard layout for {lang}"))
    }
}

pub fn set_system_language(lang: &str) -> Result<()> {
    // Do not restore_target_focus() here — that would bring back a previously
    // focused app and make "no target" look like success after the first switch.
    set_system_language_impl(lang)
}

fn set_system_language_impl(lang: &str) -> Result<()> {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        ActivateKeyboardLayout, KLF_SETFORPROCESS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowThreadProcessId, PostMessageW, WM_INPUTLANGCHANGEREQUEST,
    };

    let hwnd = super::focus_target::get_language_switch_hwnd().ok_or_else(|| {
        anyhow!(
            "No target application to switch language. Click into the app you want to type in first."
        )
    })?;

    let target_primary = match lang {
        "el" => 0x08u32,
        _ => 0x09u32,
    };

    let hkl = match find_installed_layout(target_primary) {
        Some(hkl) => hkl,
        None => load_layout_for_language(lang)?,
    };

    unsafe {
        let target_thread = GetWindowThreadProcessId(hwnd, None);
        let current_thread = GetCurrentThreadId();
        let attached = if target_thread != current_thread {
            AttachThreadInput(current_thread, target_thread, true).as_bool()
        } else {
            false
        };

        ActivateKeyboardLayout(hkl, KLF_SETFORPROCESS)?;
        let _ = PostMessageW(
            hwnd,
            WM_INPUTLANGCHANGEREQUEST,
            WPARAM(0),
            LPARAM(hkl.0 as isize),
        );

        if attached {
            let _ = AttachThreadInput(current_thread, target_thread, false);
        }
    }
    Ok(())
}
