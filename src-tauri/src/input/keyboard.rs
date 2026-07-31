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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InputMethod {
    /// Opaque Windows HKL value for activation.
    pub hkl: u64,
    /// ISO-639 language tag (e.g. "de", "el", "en").
    pub lang_tag: String,
    pub display_name: String,
    pub layout_name: String,
    /// Keyboard layout id string, e.g. "00000407".
    pub klid: String,
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
    pub system_klid: String,
    pub system_hkl: u64,
    /// True when an external target window is available for typing.
    pub has_input_target: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutKeyLabel {
    pub key: String,
    pub label: String,
    pub shift_label: Option<String>,
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

fn active_hkl() -> windows::Win32::UI::Input::KeyboardAndMouse::HKL {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayout, HKL};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    let hwnd = match get_effective_input_hwnd() {
        Some(hwnd) => hwnd,
        None => unsafe { GetForegroundWindow() },
    };
    if hwnd.0.is_null() {
        return HKL(0x0409usize as _);
    }
    unsafe {
        let thread_id = GetWindowThreadProcessId(hwnd, None);
        GetKeyboardLayout(thread_id)
    }
}

fn active_input_method() -> InputMethod {
    let hkl = active_hkl();
    describe_hkl(hkl)
}

pub fn lang_id_to_iso_tag(lang_id: u32) -> String {
    use windows::Win32::Globalization::{GetLocaleInfoW, LOCALE_SISO639LANGNAME};

    let lcid = lang_id & 0xFFFF;
    let mut buf = [0u16; 16];
    let len = unsafe { GetLocaleInfoW(lcid, LOCALE_SISO639LANGNAME, Some(&mut buf)) };
    if len > 1 {
        let tag = String::from_utf16_lossy(&buf[..(len as usize - 1)]).to_lowercase();
        if !tag.is_empty() {
            return tag;
        }
    }
    primary_lang_fallback(lang_id & 0x3FF)
}

fn primary_lang_fallback(primary: u32) -> String {
    match primary {
        0x07 => "de".to_string(),
        0x08 => "el".to_string(),
        0x09 => "en".to_string(),
        0x0A => "es".to_string(),
        0x0C => "fr".to_string(),
        0x10 => "it".to_string(),
        0x16 => "pt".to_string(),
        0x19 => "ru".to_string(),
        0x1F => "tr".to_string(),
        0x15 => "pl".to_string(),
        0x13 => "nl".to_string(),
        0x11 => "ja".to_string(),
        0x04 => "zh".to_string(),
        0x12 => "ko".to_string(),
        0x01 => "ar".to_string(),
        0x0E => "hu".to_string(),
        0x05 => "cs".to_string(),
        0x1B => "sk".to_string(),
        0x1A => "hr".to_string(),
        0x18 => "ro".to_string(),
        0x22 => "uk".to_string(),
        0x0B => "fi".to_string(),
        0x1D => "sv".to_string(),
        0x14 => "no".to_string(),
        0x06 => "da".to_string(),
        _ => format!("und-{primary:02x}"),
    }
}

fn lang_id_display_name(lang_id: u32) -> String {
    use windows::Win32::Globalization::{GetLocaleInfoW, LOCALE_SLOCALIZEDLANGUAGENAME};

    let lcid = lang_id & 0xFFFF;
    let mut buf = [0u16; 128];
    let len = unsafe { GetLocaleInfoW(lcid, LOCALE_SLOCALIZEDLANGUAGENAME, Some(&mut buf)) };
    if len > 1 {
        let name = String::from_utf16_lossy(&buf[..(len as usize - 1)]);
        if !name.is_empty() {
            return name;
        }
    }
    lang_id_to_iso_tag(lang_id).to_uppercase()
}

/// App chrome locales only (`en` / `el`); unsupported → `en`.
pub fn windows_ui_language() -> String {
    use windows::Win32::Globalization::GetUserDefaultUILanguage;
    let lang_id = unsafe { GetUserDefaultUILanguage() } as u32;
    match lang_id_to_iso_tag(lang_id).as_str() {
        "el" => "el".to_string(),
        _ => "en".to_string(),
    }
}

fn klid_to_layout_name(klid: &str) -> String {
    let normalized = klid.trim().to_uppercase();
    match normalized.as_str() {
        "00000409" | "00000809" | "00000C09" | "00001009" | "00001409" | "00001809"
        | "00001C09" | "00002009" | "00002409" | "00002809" | "00002C09" | "00003009"
        | "00003409" | "00003809" | "00003C09" | "00004009" | "00004409" | "00004809"
        | "00004C09" | "00005009" => "QWERTY".to_string(),
        "00000407" | "00000807" | "00000C07" | "00001007" | "00001407" | "0000040E"
        | "0000041B" | "00000405" | "0000041A" | "00000424" => "QWERTZ".to_string(),
        "0000040C" | "0000080C" | "0000100C" | "0000140C" | "0000180C" | "00020C0C"
        | "00000481" | "00000813" => "AZERTY".to_string(),
        "00000408" | "00010408" => "Greek".to_string(),
        "00000419" | "00010419" => "Russian".to_string(),
        "00000411" => "Japanese".to_string(),
        "00000412" => "Korean".to_string(),
        "00000404" | "00000804" | "00000C04" | "00001004" => "Chinese".to_string(),
        "00020409" | "00010409" => "QWERTY".to_string(), // US International / Dvorak variants still Latin
        _ => {
            if normalized.ends_with("0408") {
                "Greek".to_string()
            } else if normalized.ends_with("0407") {
                "QWERTZ".to_string()
            } else if normalized.ends_with("040C") {
                "AZERTY".to_string()
            } else if normalized.ends_with("0409") || normalized.ends_with("0809") {
                "QWERTY".to_string()
            } else {
                format!("Layout-{normalized}")
            }
        }
    }
}

fn hkl_to_klid(hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL) -> String {
    // Derive KLID from HKL bits without ActivateKeyboardLayout (safe for enumeration).
    // LOWORD = LANGID, HIWORD = layout variant (or equals LANGID / 0 for defaults).
    let value = hkl.0 as u32;
    let lang_id = value & 0xFFFF;
    let device = (value >> 16) & 0xFFFF;
    if device == 0 || device == lang_id {
        format!("{lang_id:08X}")
    } else {
        format!("{device:04X}{lang_id:04X}")
    }
}

fn describe_hkl(hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL) -> InputMethod {
    let lang_id = (hkl.0 as u32) & 0xFFFF;
    let lang_tag = lang_id_to_iso_tag(lang_id);
    let display_name = lang_id_display_name(lang_id);
    let klid = hkl_to_klid(hkl);
    let layout_name = klid_to_layout_name(&klid);
    InputMethod {
        hkl: hkl.0 as u64,
        lang_tag,
        display_name,
        layout_name,
        klid,
    }
}

fn installed_hkls() -> Vec<windows::Win32::UI::Input::KeyboardAndMouse::HKL> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayoutList, HKL};

    unsafe {
        let count = GetKeyboardLayoutList(None);
        if count <= 0 {
            return Vec::new();
        }
        let mut list = vec![HKL::default(); count as usize];
        let filled = GetKeyboardLayoutList(Some(&mut list));
        if filled <= 0 {
            return Vec::new();
        }
        list.truncate(filled as usize);
        list
    }
}

pub fn get_input_methods() -> Vec<InputMethod> {
    let mut methods: Vec<InputMethod> = installed_hkls().into_iter().map(describe_hkl).collect();
    // Stable order: display name, then klid.
    methods.sort_by(|a, b| {
        a.display_name
            .cmp(&b.display_name)
            .then_with(|| a.klid.cmp(&b.klid))
    });
    methods
}

pub fn get_installed_language_tags() -> Vec<String> {
    let mut tags: Vec<String> = get_input_methods()
        .into_iter()
        .map(|m| m.lang_tag)
        .collect();
    tags.sort();
    tags.dedup();
    if tags.is_empty() {
        tags.push("en".to_string());
    }
    tags
}

pub fn get_keyboard_layout() -> String {
    active_input_method().layout_name
}

fn find_hkl_for_language(
    lang: &str,
    klid: Option<&str>,
) -> Option<windows::Win32::UI::Input::KeyboardAndMouse::HKL> {
    use windows::Win32::UI::Input::KeyboardAndMouse::HKL;

    let lang = lang.to_lowercase();
    let want_klid = klid.map(|k| k.trim().to_uppercase());
    let methods = get_input_methods();

    if let Some(ref klid) = want_klid {
        if let Some(m) = methods
            .iter()
            .find(|m| m.lang_tag == lang && m.klid.eq_ignore_ascii_case(klid))
        {
            return Some(HKL(m.hkl as _));
        }
    }
    methods
        .iter()
        .find(|m| m.lang_tag == lang)
        .map(|m| HKL(m.hkl as _))
}

fn load_layout_for_language(
    lang: &str,
) -> Result<windows::Win32::UI::Input::KeyboardAndMouse::HKL> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        LoadKeyboardLayoutW, ACTIVATE_KEYBOARD_LAYOUT_FLAGS,
    };

    let klid = match lang.to_lowercase().as_str() {
        "el" => "00000408",
        "de" => "00000407",
        "fr" => "0000040C",
        "es" => "0000040A",
        "it" => "00000410",
        "pt" => "00000816",
        "ru" => "00000419",
        _ => "00000409",
    };
    let wide: Vec<u16> = klid.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        LoadKeyboardLayoutW(
            PCWSTR(wide.as_ptr()),
            ACTIVATE_KEYBOARD_LAYOUT_FLAGS(0x00000001),
        )
        .map_err(|_| anyhow!("Failed to load keyboard layout for {lang}"))
    }
}

pub fn set_system_language(lang: &str) -> Result<()> {
    set_input_method_by_language(lang, None)
}

pub fn set_input_method_by_language(lang: &str, klid: Option<&str>) -> Result<()> {
    let hkl = match find_hkl_for_language(lang, klid) {
        Some(hkl) => hkl,
        None => load_layout_for_language(lang)?,
    };
    activate_hkl(hkl)
}

pub fn set_input_method_by_hkl(hkl_value: u64) -> Result<()> {
    use windows::Win32::UI::Input::KeyboardAndMouse::HKL;
    if hkl_value == 0 {
        return Err(anyhow!("Invalid keyboard layout handle"));
    }
    activate_hkl(HKL(hkl_value as _))
}

fn activate_hkl(hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL) -> Result<()> {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        ActivateKeyboardLayout, KLF_SETFORPROCESS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, SystemParametersInfoW,
        SPIF_SENDCHANGE, SPI_SETDEFAULTINPUTLANG, WM_INPUTLANGCHANGEREQUEST,
    };

    unsafe {
        // Persist as the system default input language (works without a typing target).
        let mut hkl_param = hkl;
        let _ = SystemParametersInfoW(
            SPI_SETDEFAULTINPUTLANG,
            0,
            Some((&mut hkl_param as *mut _) as *mut _),
            SPIF_SENDCHANGE,
        );

        ActivateKeyboardLayout(hkl, KLF_SETFORPROCESS)?;

        // Prefer remembered typing target; otherwise foreground (desktop/shell is fine).
        let hwnd = super::focus_target::get_language_switch_hwnd()
            .or_else(|| {
                let fg = GetForegroundWindow();
                if fg.0.is_null() {
                    None
                } else {
                    Some(fg)
                }
            });

        if let Some(hwnd) = hwnd {
            let target_thread = GetWindowThreadProcessId(hwnd, None);
            let current_thread = GetCurrentThreadId();
            let attached = if target_thread != current_thread {
                AttachThreadInput(current_thread, target_thread, true).as_bool()
            } else {
                false
            };

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
    }
    Ok(())
}

/// Map QWERTY-position key names to glyphs for the given (or active) HKL via ToUnicodeEx.
pub fn get_layout_key_labels(hkl_value: Option<u64>) -> Vec<LayoutKeyLabel> {
    use windows::Win32::UI::Input::KeyboardAndMouse::HKL;

    let hkl = match hkl_value {
        Some(v) if v != 0 => HKL(v as _),
        _ => active_hkl(),
    };

    const KEYS: &[(&str, u16)] = &[
        ("`", 0xC0),
        ("1", 0x31),
        ("2", 0x32),
        ("3", 0x33),
        ("4", 0x34),
        ("5", 0x35),
        ("6", 0x36),
        ("7", 0x37),
        ("8", 0x38),
        ("9", 0x39),
        ("0", 0x30),
        ("-", 0xBD),
        ("=", 0xBB),
        ("q", 0x51),
        ("w", 0x57),
        ("e", 0x45),
        ("r", 0x52),
        ("t", 0x54),
        ("y", 0x59),
        ("u", 0x55),
        ("i", 0x49),
        ("o", 0x4F),
        ("p", 0x50),
        ("[", 0xDB),
        ("]", 0xDD),
        ("\\", 0xDC),
        ("a", 0x41),
        ("s", 0x53),
        ("d", 0x44),
        ("f", 0x46),
        ("g", 0x47),
        ("h", 0x48),
        ("j", 0x4A),
        ("k", 0x4B),
        ("l", 0x4C),
        (";", 0xBA),
        ("'", 0xDE),
        ("z", 0x5A),
        ("x", 0x58),
        ("c", 0x43),
        ("v", 0x56),
        ("b", 0x42),
        ("n", 0x4E),
        ("m", 0x4D),
        (",", 0xBC),
        (".", 0xBE),
        ("/", 0xBF),
    ];

    let mut labels = Vec::with_capacity(KEYS.len());
    for &(key, vk) in KEYS {
        let label = to_unicode_for_vk(hkl, vk, false);
        let shift_label = to_unicode_for_vk(hkl, vk, true);
        if label.is_empty() {
            continue;
        }
        let shift_label = if shift_label.is_empty() || shift_label == label {
            None
        } else {
            Some(shift_label)
        };
        labels.push(LayoutKeyLabel {
            key: key.to_string(),
            label,
            shift_label,
        });
    }
    labels
}

fn to_unicode_for_vk(
    hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL,
    vk: u16,
    shift: bool,
) -> String {
    use windows::Win32::UI::Input::KeyboardAndMouse::{MapVirtualKeyExW, ToUnicodeEx, MAPVK_VK_TO_VSC};

    unsafe {
        let scan = MapVirtualKeyExW(vk as u32, MAPVK_VK_TO_VSC, hkl);
        let mut state = [0u8; 256];
        if shift {
            state[0x10] = 0x80; // VK_SHIFT
        }
        let mut buf = [0u16; 8];
        // Clear dead-key state from prior calls.
        let _ = ToUnicodeEx(vk as u32, scan, &state, &mut buf, 0, hkl);
        let mut buf = [0u16; 8];
        let result = ToUnicodeEx(vk as u32, scan, &state, &mut buf, 0, hkl);
        if result >= 1 {
            String::from_utf16_lossy(&buf[..result as usize])
        } else {
            String::new()
        }
    }
}
