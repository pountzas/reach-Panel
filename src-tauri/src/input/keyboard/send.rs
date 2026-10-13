use super::super::focus_target::with_target_focus;
use super::layout::qwerty_key_to_vk;
use anyhow::{anyhow, Result};
use serde::Deserialize;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    VIRTUAL_KEY, VK_BACK, VK_CAPITAL, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1,
    VK_HOME, VK_LEFT, VK_LMENU, VK_LWIN, VK_NEXT, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SHIFT, VK_SPACE,
    VK_TAB, VK_UP,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyPressRequest {
    pub key: String,
    pub modifiers: Vec<String>,
    /// QWERTY physical slot (e.g. "q") when the injected character must not use US VK mapping.
    #[serde(default)]
    pub physical_key: Option<String>,
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
    let flags = if key_up {
        KEYEVENTF_KEYUP
    } else {
        Default::default()
    };
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
        let Some(ch) = key.chars().next() else {
            return Err(anyhow!("Empty key"));
        };
        // Greek EL maps ";" to the Q slot — char_to_vk(';') hits tonos (VK 0xBA) instead.
        if ch.is_ascii() {
            if let Some(pk) = request.physical_key.as_deref() {
                if let Some(vk) = qwerty_key_to_vk(pk) {
                    send_vk(VIRTUAL_KEY(vk), false)?;
                    send_vk(VIRTUAL_KEY(vk), true)?;
                    for modifier in request.modifiers.iter().rev() {
                        if let Some(vk) = modifier_vk(modifier) {
                            send_vk(vk, true)?;
                        }
                    }
                    return Ok(());
                }
            }
            if let Some(vk) = char_to_vk(ch) {
                let needs_shift = ch.is_ascii_uppercase()
                    || matches!(
                        ch,
                        '!' | '@' | '#' | '$' | '%' | '^' | '&' | '*' | '(' | ')'
                    );
                if needs_shift
                    && !request
                        .modifiers
                        .iter()
                        .any(|m| m.eq_ignore_ascii_case("shift"))
                {
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
            if let Some(ch) = key.chars().next() {
                if let Some(vk) = char_to_vk(ch) {
                    vks.push(vk);
                }
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

