//! Non-Windows input stubs — API surface mirrors the Windows module for compile-time parity.
#![allow(dead_code)]

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

pub mod focus_target {
    pub fn init() {}
    pub fn remember_current_if_external() {}
    pub fn has_input_target() -> bool {
        false
    }
    pub fn get_language_switch_hwnd() -> Option<()> {
        None
    }
}

#[derive(Debug, Deserialize)]
pub struct KeyPressRequest {
    pub key: String,
    pub modifiers: Vec<String>,
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
    pub has_input_target: bool,
}

fn unsupported<T>() -> Result<T> {
    Err(anyhow!(
        "Input injection is not yet supported on this platform. Windows build required for full functionality."
    ))
}

pub fn press_key(_request: KeyPressRequest) -> Result<()> {
    unsupported()
}

pub fn type_text(_text: &str) -> Result<()> {
    unsupported()
}

pub fn press_combo(_keys: Vec<String>) -> Result<()> {
    unsupported()
}

pub fn press_media_key(_key: &str) -> Result<()> {
    unsupported()
}

pub fn get_keyboard_state() -> KeyboardState {
    KeyboardState {
        caps_lock: false,
        shift: false,
        ctrl: false,
        alt: false,
        win: false,
        pressed_vks: vec![],
        system_language: "en".to_string(),
        keyboard_layout: "QWERTY".to_string(),
        has_input_target: false,
    }
}

pub fn get_keyboard_layout() -> String {
    "QWERTY".to_string()
}

pub fn set_system_language(_lang: &str) -> Result<()> {
    unsupported()
}

pub fn move_cursor_relative(_dx: i32, _dy: i32) -> Result<()> {
    unsupported()
}

pub fn move_cursor_absolute(_x: i32, _y: i32) -> Result<()> {
    unsupported()
}

pub fn get_cursor_position() -> Result<(i32, i32)> {
    unsupported()
}

pub fn mouse_click(_button: &str) -> Result<()> {
    unsupported()
}

pub fn mouse_double_click() -> Result<()> {
    unsupported()
}

pub fn mouse_scroll(_delta: i32, _horizontal: bool) -> Result<()> {
    unsupported()
}
