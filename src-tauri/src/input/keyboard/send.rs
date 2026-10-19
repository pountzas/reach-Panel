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

trait KeySender {
    fn send_vk(&mut self, vk: VIRTUAL_KEY, key_up: bool) -> Result<()>;
    fn send_unicode(&mut self, ch: char) -> Result<()>;
}

struct OsKeySender;

impl KeySender for OsKeySender {
    fn send_vk(&mut self, vk: VIRTUAL_KEY, key_up: bool) -> Result<()> {
        send_vk(vk, key_up)
    }

    fn send_unicode(&mut self, ch: char) -> Result<()> {
        send_unicode(ch)
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
        let err = anyhow!("SendInput failed for virtual key");
        eprintln!("{err}");
        return Err(err);
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
        let err = anyhow!("SendInput failed for unicode");
        eprintln!("{err}");
        return Err(err);
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

fn release_modifiers(sender: &mut dyn KeySender, pressed: &[VIRTUAL_KEY]) {
    for vk in pressed.iter().rev() {
        if let Err(err) = sender.send_vk(*vk, true) {
            eprintln!("SendInput failed releasing modifier: {err}");
        }
    }
}

pub fn press_key(request: KeyPressRequest) -> Result<()> {
    with_target_focus(|| press_key_with_sender(request, &mut OsKeySender))
}

fn press_key_with_sender(request: KeyPressRequest, sender: &mut dyn KeySender) -> Result<()> {
    let key = request.key.trim();
    if key.is_empty() {
        return Err(anyhow!("Empty key"));
    }

    let mut pressed_modifiers: Vec<VIRTUAL_KEY> = Vec::new();
    let result = (|| -> Result<()> {
        for modifier in &request.modifiers {
            if let Some(vk) = modifier_vk(modifier) {
                sender.send_vk(vk, false)?;
                pressed_modifiers.push(vk);
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
                        sender.send_vk(VIRTUAL_KEY(vk), false)?;
                        sender.send_vk(VIRTUAL_KEY(vk), true)?;
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
                        sender.send_vk(VK_SHIFT, false)?;
                        pressed_modifiers.push(VK_SHIFT);
                        sender.send_vk(vk, false)?;
                        sender.send_vk(vk, true)?;
                    } else {
                        sender.send_vk(vk, false)?;
                        sender.send_vk(vk, true)?;
                    }
                } else {
                    sender.send_unicode(ch)?;
                }
            } else {
                sender.send_unicode(ch)?;
            }
        } else if let Some(vk) = special_vk(key) {
            sender.send_vk(vk, false)?;
            sender.send_vk(vk, true)?;
        } else if key.starts_with("F") && key.len() <= 3 {
            if let Ok(num) = key[1..].parse::<u16>() {
                if (1..=24).contains(&num) {
                    sender.send_vk(VIRTUAL_KEY(0x70 + num - 1), false)?;
                    sender.send_vk(VIRTUAL_KEY(0x70 + num - 1), true)?;
                }
            }
        } else {
            for ch in key.chars() {
                sender.send_unicode(ch)?;
            }
        }

        Ok(())
    })();

    // Always release modifiers that were pressed, even when SendInput fails mid-way (#299).
    release_modifiers(sender, &pressed_modifiers);
    result
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
    let mut pressed: Vec<VIRTUAL_KEY> = Vec::new();
    let result = (|| -> Result<()> {
        for vk in &vks {
            send_vk(*vk, false)?;
            pressed.push(*vk);
        }
        Ok(())
    })();
    release_modifiers(&mut OsKeySender, &pressed);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct MockSender {
        /// Fail on the Nth send_vk call (1-based). None = never fail.
        fail_on_call: Option<usize>,
        calls: RefCell<Vec<(u16, bool)>>,
    }

    impl MockSender {
        fn new(fail_on_call: Option<usize>) -> Self {
            Self {
                fail_on_call,
                calls: RefCell::new(Vec::new()),
            }
        }

        fn calls(&self) -> Vec<(u16, bool)> {
            self.calls.borrow().clone()
        }
    }

    impl KeySender for MockSender {
        fn send_vk(&mut self, vk: VIRTUAL_KEY, key_up: bool) -> Result<()> {
            let mut calls = self.calls.borrow_mut();
            calls.push((vk.0, key_up));
            let n = calls.len();
            if self.fail_on_call == Some(n) {
                return Err(anyhow!("SendInput failed for virtual key"));
            }
            Ok(())
        }

        fn send_unicode(&mut self, _ch: char) -> Result<()> {
            Ok(())
        }
    }

    #[test]
    fn releases_modifiers_when_main_key_send_fails() {
        // Call 1: Ctrl down; call 2: main key down → fail; then Ctrl up must still run.
        let mut sender = MockSender::new(Some(2));
        let request = KeyPressRequest {
            key: "a".into(),
            modifiers: vec!["ctrl".into()],
            physical_key: None,
        };
        let err = press_key_with_sender(request, &mut sender).expect_err("main key should fail");
        assert!(err.to_string().contains("SendInput failed"));

        let calls = sender.calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], (VK_CONTROL.0, false));
        assert_eq!(calls[1].1, false); // main key down
        assert_eq!(calls[2], (VK_CONTROL.0, true)); // always released
    }
}
