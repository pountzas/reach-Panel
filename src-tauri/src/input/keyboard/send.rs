use super::super::focus_target::with_target_focus;
use super::layout::qwerty_key_to_vk;
use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::sync::Mutex;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_BACK, VK_CAPITAL, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END,
    VK_ESCAPE, VK_F1, VK_HOME, VK_LEFT, VK_LMENU, VK_LWIN, VK_NEXT, VK_PRIOR, VK_RETURN, VK_RIGHT,
    VK_RMENU, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
};

fn vk_uses_extended_key(vk: VIRTUAL_KEY) -> bool {
    vk == VK_RMENU
}

fn vk_key_event_flags(vk: VIRTUAL_KEY, key_up: bool) -> u32 {
    let mut flags = if key_up { KEYEVENTF_KEYUP.0 } else { 0 };
    if vk_uses_extended_key(vk) {
        flags |= KEYEVENTF_EXTENDEDKEY.0;
    }
    flags
}

static HELD_COMBO_KEYS: Mutex<Vec<VIRTUAL_KEY>> = Mutex::new(Vec::new());

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
        "ralt" | "rightalt" | "rmenu" => Some(VK_RMENU),
        "win" | "meta" => Some(VK_LWIN),
        _ => None,
    }
}

pub(crate) fn combo_keys_to_vks(keys: &[String]) -> Result<Vec<VIRTUAL_KEY>> {
    let mut vks: Vec<VIRTUAL_KEY> = Vec::new();
    for key in keys {
        if let Some(vk) = modifier_vk(key) {
            vks.push(vk);
        } else if let Some(vk) = special_vk(key) {
            vks.push(vk);
        } else if key.len() == 1 {
            let ch = key.chars().next().expect("len checked");
            let vk = char_to_vk(ch).ok_or_else(|| anyhow!("Unknown key token: {key}"))?;
            vks.push(vk);
        } else {
            return Err(anyhow!("Unknown key token: {key}"));
        }
    }
    if vks.is_empty() {
        return Err(anyhow!("No keys in combo"));
    }
    Ok(vks)
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
        _ => f_key_vk(key),
    }
}

fn f_key_vk(key: &str) -> Option<VIRTUAL_KEY> {
    let lower = key.to_lowercase();
    let num = lower.strip_prefix('f')?.parse::<u16>().ok()?;
    if !(1..=24).contains(&num) {
        return None;
    }
    Some(VIRTUAL_KEY(VK_F1.0 + num - 1))
}

pub(super) fn send_input_incomplete(sent: u32, expected: u32) -> bool {
    sent != expected
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
    let flags = vk_key_event_flags(vk, key_up);
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS(flags),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let expected = 1u32;
    let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
    if send_input_incomplete(sent, expected) {
        log::warn!("SendInput short count sent={sent} expected={expected}");
        let err = anyhow!("SendInput failed for virtual key");
        log::error!("{err}");
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
    let expected = 2u32;
    let sent = unsafe { SendInput(&[down, up], std::mem::size_of::<INPUT>() as i32) };
    if send_input_incomplete(sent, expected) {
        if sent == 1 {
            let _ = unsafe { SendInput(&[up], std::mem::size_of::<INPUT>() as i32) };
        }
        log::warn!("SendInput short count sent={sent} expected={expected}");
        let err = anyhow!("SendInput failed for unicode");
        log::error!("{err}");
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

fn release_modifiers(sender: &mut dyn KeySender, pressed: &[VIRTUAL_KEY]) -> Result<()> {
    let mut first_err: Option<anyhow::Error> = None;
    for vk in pressed.iter().rev() {
        if let Err(err) = sender.send_vk(*vk, true) {
            log::error!("SendInput failed releasing modifier: {err}");
            if first_err.is_none() {
                first_err = Some(err);
            }
        }
    }
    match first_err {
        Some(err) => Err(err),
        None => Ok(()),
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
    let released = release_modifiers(sender, &pressed_modifiers);
    result.and(released)
}

pub fn type_text(text: &str) -> Result<()> {
    with_target_focus(|| type_text_with_sender(text, &mut OsKeySender))
}

fn type_text_with_sender(text: &str, sender: &mut dyn KeySender) -> Result<()> {
    for ch in text.chars() {
        if ch == '\n' {
            sender.send_vk(VK_RETURN, false)?;
            sender.send_vk(VK_RETURN, true)?;
        } else if ch.is_ascii() {
            if let Some(vk) = char_to_vk(ch) {
                if ch.is_ascii_uppercase() {
                    sender.send_vk(VK_SHIFT, false)?;
                    let result = sender
                        .send_vk(vk, false)
                        .and_then(|_| sender.send_vk(vk, true));
                    // Always release Shift, even if the main key failed (#299).
                    let released = release_modifiers(sender, &[VK_SHIFT]);
                    result.and(released)?;
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
    }
    Ok(())
}

pub fn press_combo(keys: Vec<String>) -> Result<()> {
    with_target_focus(|| press_combo_impl(keys))
}

fn hold_combo_down_with_sender(keys: Vec<String>, sender: &mut dyn KeySender) -> Result<()> {
    let vks = combo_keys_to_vks(&keys)?;
    let mut held = HELD_COMBO_KEYS
        .lock()
        .map_err(|_| anyhow!("Held key state poisoned"))?;
    if !held.is_empty() {
        release_vks(sender, &held)?;
        held.clear();
    }
    for vk in &vks {
        sender.send_vk(*vk, false)?;
        held.push(*vk);
    }
    Ok(())
}

/// Press a combo down for hold-to-talk without releasing (after refocus elsewhere).
pub fn hold_combo_down(keys: Vec<String>) -> Result<()> {
    hold_combo_down_with_sender(keys, &mut OsKeySender)
}

fn release_vks(sender: &mut dyn KeySender, vks: &[VIRTUAL_KEY]) -> Result<()> {
    release_modifiers(sender, vks)
}

fn release_held_combo_keys_with_sender(sender: &mut dyn KeySender) -> Result<()> {
    let mut held = HELD_COMBO_KEYS
        .lock()
        .map_err(|_| anyhow!("Held key state poisoned"))?;
    if held.is_empty() {
        return Ok(());
    }
    let mut first_err: Option<anyhow::Error> = None;
    let mut still_held: Vec<VIRTUAL_KEY> = Vec::new();
    for vk in held.iter().rev() {
        match sender.send_vk(*vk, true) {
            Ok(()) => {}
            Err(err) => {
                still_held.push(*vk);
                if first_err.is_none() {
                    first_err = Some(err);
                }
            }
        }
    }
    still_held.reverse();
    *held = still_held;
    match first_err {
        Some(err) => Err(err),
        None => Ok(()),
    }
}

/// Release any keys left down by hold-to-talk (pointer up, cancel, blur, or exit).
pub fn release_held_combo_keys() -> Result<()> {
    release_held_combo_keys_with_sender(&mut OsKeySender)
}

fn press_combo_impl(keys: Vec<String>) -> Result<()> {
    let vks = combo_keys_to_vks(&keys)?;
    let mut pressed: Vec<VIRTUAL_KEY> = Vec::new();
    let result = (|| -> Result<()> {
        for vk in &vks {
            send_vk(*vk, false)?;
            pressed.push(*vk);
        }
        Ok(())
    })();
    let released = release_modifiers(&mut OsKeySender, &pressed);
    result.and(released)
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

    #[test]
    fn right_alt_preset_maps_to_vk_rmenu() {
        let vks = combo_keys_to_vks(&["ralt".into()]).expect("ralt vk");
        assert_eq!(vks, vec![VK_RMENU]);
    }

    #[test]
    fn f_keys_f1_through_f24_map_to_vks() {
        let vks = combo_keys_to_vks(&["f12".into()]).expect("f12");
        assert_eq!(vks, vec![VIRTUAL_KEY(VK_F1.0 + 11)]);
        let vks = combo_keys_to_vks(&["f24".into()]).expect("f24");
        assert_eq!(vks, vec![VIRTUAL_KEY(VK_F1.0 + 23)]);
    }

    #[test]
    fn unknown_combo_token_errors() {
        let err = combo_keys_to_vks(&["fn".into()]).expect_err("unknown");
        assert!(err.to_string().contains("Unknown key token"));
    }

    #[test]
    fn ctrl_shift_f9_combo_maps_to_vks() {
        let vks =
            combo_keys_to_vks(&["ctrl".into(), "shift".into(), "f9".into()]).expect("ctrl+shift+f9");
        assert_eq!(
            vks,
            vec![VK_CONTROL, VK_SHIFT, VIRTUAL_KEY(VK_F1.0 + 8)]
        );
    }

    #[test]
    fn greek_eta_combo_token_errors() {
        let err = combo_keys_to_vks(&["η".into()]).expect_err("non-ascii combo token");
        assert!(err.to_string().contains("Unknown key token"));
    }

    #[test]
    fn held_combo_cleared_only_after_successful_key_up() {
        let _ = release_held_combo_keys();
        let mut hold_sender = MockSender::new(None);
        hold_combo_down_with_sender(vec!["ctrl".into(), "shift".into()], &mut hold_sender)
            .expect("hold down");
        let mut partial_release = MockSender::new(Some(1));
        let err = release_held_combo_keys_with_sender(&mut partial_release)
            .expect_err("first key up fails");
        assert!(err.to_string().contains("SendInput failed"));
        let mut finish_release = MockSender::new(None);
        release_held_combo_keys_with_sender(&mut finish_release)
            .expect("remaining held key releases");
        assert!(finish_release.calls().iter().any(|c| c == &(VK_SHIFT.0, true)));
    }

    #[test]
    fn hold_down_sends_key_down_and_release_sends_key_up() {
        let _ = release_held_combo_keys();
        let mut sender = MockSender::new(None);
        hold_combo_down_with_sender(vec!["ralt".into()], &mut sender).expect("hold down");
        let down_calls = sender.calls();
        assert_eq!(down_calls.len(), 1);
        assert_eq!(down_calls[0], (VK_RMENU.0, false));

        release_held_combo_keys_with_sender(&mut sender).expect("release");
        let all_calls = sender.calls();
        assert_eq!(all_calls.len(), 2);
        assert_eq!(all_calls[1], (VK_RMENU.0, true));
    }

    #[test]
    fn right_alt_down_uses_extended_key_flag() {
        let flags = vk_key_event_flags(VK_RMENU, false);
        assert_ne!(flags & KEYEVENTF_EXTENDEDKEY.0, 0);
        let up = vk_key_event_flags(VK_RMENU, true);
        assert_ne!(up & KEYEVENTF_EXTENDEDKEY.0, 0);
        assert_ne!(up & KEYEVENTF_KEYUP.0, 0);
    }

    #[test]
    fn type_text_releases_shift_when_uppercase_key_fails() {
        // Call 1: Shift down; call 2: 'A' down → fail; Shift up must still run.
        let mut sender = MockSender::new(Some(2));
        let err = type_text_with_sender("A", &mut sender).expect_err("main key should fail");
        assert!(err.to_string().contains("SendInput failed"));

        let calls = sender.calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], (VK_SHIFT.0, false));
        assert_eq!(calls[1].1, false);
        assert_eq!(calls[2], (VK_SHIFT.0, true));
    }
}
