//! Modifier / caps / pressed-key snapshot for the UI.

use super::layout::active_input_method;
use super::super::focus_target;
use serde::Serialize;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetKeyState, VK_CAPITAL};

fn get_caps_lock_state() -> bool {
    unsafe { GetKeyState(VK_CAPITAL.0 as i32) & 0x0001 != 0 }
}

#[derive(Debug, Serialize, Clone)]
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
    pub system_klid: String,
    pub system_hkl: u64,
    /// True when an external target window is available for typing.
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
        0x08, 0x09, 0x0D, 0x10, 0xA0, 0xA1, 0x11, 0xA2, 0xA3, 0x12, 0xA4, 0xA5, 0x14, 0x20, 0x5B,
        0x5C, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, 0xC0, 0xDB, 0xDC, 0xDD, 0xDE,
    ] {
        if is_async_key_down(vk) {
            pressed_vks.push(vk as u16);
        }
    }
    pressed_vks.sort_unstable();
    pressed_vks.dedup();

    let has_input_target = focus_target::has_input_target();
    let active = active_input_method();
    KeyboardState {
        caps_lock: get_caps_lock_state(),
        shift: is_async_key_down(0x10) || is_async_key_down(0xA0) || is_async_key_down(0xA1),
        ctrl: is_async_key_down(0x11) || is_async_key_down(0xA2) || is_async_key_down(0xA3),
        alt: is_async_key_down(0x12) || is_async_key_down(0xA4) || is_async_key_down(0xA5),
        win: is_async_key_down(0x5B) || is_async_key_down(0x5C),
        pressed_vks,
        system_language: active.lang_tag,
        keyboard_layout: active.layout_name,
        system_klid: active.klid,
        system_hkl: active.hkl,
        has_input_target,
    }
}

