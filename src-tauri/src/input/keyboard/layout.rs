//! Keyboard layout / HKL enumeration, activation, and per-key labels.

use super::super::focus_target::get_effective_input_hwnd;
use anyhow::{anyhow, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

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
pub struct LayoutKeyLabel {
    pub key: String,
    pub label: String,
    pub shift_label: Option<String>,
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

pub(super) fn active_input_method() -> InputMethod {
    let hkl = active_hkl();
    describe_hkl(hkl)
}

fn lang_id_to_iso_tag(lang_id: u32) -> String {
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

/// App chrome locales only (`en` / `el` / `de` / `fr` / `it` / `es` / `pt`); unsupported → `en`.
pub fn windows_ui_language() -> String {
    use windows::Win32::Globalization::GetUserDefaultUILanguage;
    let lang_id = unsafe { GetUserDefaultUILanguage() } as u32;
    let tag = lang_id_to_iso_tag(lang_id);
    match tag.as_str() {
        "el" | "de" | "fr" | "it" | "es" | "pt" => tag,
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

pub(super) fn load_layout_for_language(
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
    use windows::Win32::UI::Input::KeyboardAndMouse::{ActivateKeyboardLayout, KLF_SETFORPROCESS};
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
        let hwnd = super::super::focus_target::get_language_switch_hwnd().or_else(|| {
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
        let mut label = to_unicode_for_vk(hkl, vk, false);
        if label.is_empty() {
            if let Some(fallback) = greek_physical_fallback(vk, false, hkl) {
                label = fallback;
            }
        }
        let shift_label = to_unicode_for_vk(hkl, vk, true);
        let shift_label = if shift_label.is_empty() || shift_label == label {
            None
        } else {
            Some(shift_label)
        };
        // Include dead-key slots (often empty) so the frontend keeps physicalKey ";".
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
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        MapVirtualKeyExW, ToUnicodeEx, MAPVK_VK_TO_VSC,
    };

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
        if result != 0 {
            let len = if result > 0 {
                result as usize
            } else {
                // Dead key (result < 0): spacing accent may still be in the buffer.
                buf.iter().position(|&c| c == 0).unwrap_or(0)
            };
            if len > 0 {
                return String::from_utf16_lossy(&buf[..len]);
            }
        }
        String::new()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutKeyTranslation {
    pub text: String,
    pub dead: bool,
}

pub(super) fn qwerty_key_to_vk(key: &str) -> Option<u16> {
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
    KEYS.iter().find(|(k, _)| *k == key).map(|(_, vk)| *vk)
}

#[derive(Clone, Copy)]
struct PendingDeadKey {
    vk: u16,
    shift: bool,
    caps_lock: bool,
}

fn pending_dead_keys() -> &'static Mutex<HashMap<u64, PendingDeadKey>> {
    static MAP: OnceLock<Mutex<HashMap<u64, PendingDeadKey>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_pending_dead_keys() -> std::sync::MutexGuard<'static, HashMap<u64, PendingDeadKey>> {
    pending_dead_keys()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn is_layout_dead_key_vk(vk: u16) -> bool {
    // Only the QWERTY ; and ' slots are layout dead keys (tonos / dialytika).
    vk == 0xBA || vk == 0xDE
}

fn is_greek_hkl(hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL) -> bool {
    const LANG_GREEK: u32 = 0x0408;
    (hkl.0 as u32) & 0xFFFF == LANG_GREEK
}

fn greek_physical_fallback(
    vk: u16,
    shift: bool,
    hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL,
) -> Option<String> {
    if shift || !is_greek_hkl(hkl) {
        return None;
    }
    // QWERTY q slot → Greek question mark (;)
    if vk == 0x51 {
        return Some(";".to_string());
    }
    None
}

fn flush_thread_dead_state(hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        MapVirtualKeyExW, ToUnicodeEx, MAPVK_VK_TO_VSC, VK_SPACE,
    };

    let space = VK_SPACE;
    unsafe {
        let scan = MapVirtualKeyExW(space.0 as u32, MAPVK_VK_TO_VSC, hkl);
        let state = [0u8; 256];
        let mut buf = [0u16; 8];
        let _ = ToUnicodeEx(space.0 as u32, scan, &state, &mut buf, 0, hkl);
    }
}

fn is_spacing_accent_text(text: &str) -> bool {
    !text.is_empty()
        && text
            .chars()
            .all(|c| matches!(c, '\u{00B4}' | '\u{0384}' | '\u{1FFD}' | '\u{00A8}'))
}

fn to_unicode_ex(
    vk: u32,
    shift: bool,
    caps_lock: bool,
    hkl: windows::Win32::UI::Input::KeyboardAndMouse::HKL,
) -> (i32, String) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        MapVirtualKeyExW, ToUnicodeEx, MAPVK_VK_TO_VSC, VK_CAPITAL, VK_SHIFT,
    };

    unsafe {
        let scan = MapVirtualKeyExW(vk, MAPVK_VK_TO_VSC, hkl);
        let mut state = [0u8; 256];
        if shift {
            state[VK_SHIFT.0 as usize] = 0x80;
        }
        if caps_lock {
            // ToUnicodeEx reads Caps Lock via the toggle bit (low bit), not the down bit.
            state[VK_CAPITAL.0 as usize] = 0x01;
        }
        let mut buf = [0u16; 8];
        let result = ToUnicodeEx(vk, scan, &state, &mut buf, 0, hkl);
        let text = if result != 0 {
            let len = if result > 0 {
                result as usize
            } else {
                buf.iter().position(|&c| c == 0).unwrap_or(0)
            };
            if len > 0 {
                String::from_utf16_lossy(&buf[..len])
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        (result, text)
    }
}

/// Translate a QWERTY-position key via the active Windows layout.
/// Tracks pending dead keys in-process because ToUnicodeEx state is thread-local.
pub fn translate_layout_key_press(
    physical_key: &str,
    shift: bool,
    caps_lock: bool,
    hkl_value: Option<u64>,
) -> LayoutKeyTranslation {
    use windows::Win32::UI::Input::KeyboardAndMouse::HKL;

    let Some(vk) = qwerty_key_to_vk(physical_key) else {
        return LayoutKeyTranslation {
            text: String::new(),
            dead: false,
        };
    };

    let hkl = match hkl_value {
        Some(v) if v != 0 => HKL(v as _),
        _ => active_hkl(),
    };
    let hkl_id = hkl.0 as u64;

    if let Some(dead) = lock_pending_dead_keys().remove(&hkl_id) {
        if is_layout_dead_key_vk(dead.vk) {
            let (replay_result, _) = to_unicode_ex(dead.vk as u32, dead.shift, dead.caps_lock, hkl);
            let _ = replay_result;
        }
    }

    let (result, text) = to_unicode_ex(vk as u32, shift, caps_lock, hkl);

    if result < 0 || is_spacing_accent_text(&text) {
        if is_layout_dead_key_vk(vk) {
            lock_pending_dead_keys().insert(
                hkl_id,
                PendingDeadKey {
                    vk,
                    shift,
                    caps_lock,
                },
            );
            return LayoutKeyTranslation {
                text: String::new(),
                dead: true,
            };
        }
        flush_thread_dead_state(hkl);
        let (retry_result, retry_text) = to_unicode_ex(vk as u32, shift, caps_lock, hkl);
        if retry_result > 0 && !retry_text.is_empty() && !is_spacing_accent_text(&retry_text) {
            lock_pending_dead_keys().remove(&hkl_id);
            return LayoutKeyTranslation {
                text: retry_text,
                dead: false,
            };
        }
        return LayoutKeyTranslation {
            text: String::new(),
            dead: false,
        };
    }

    if result > 0 && !text.is_empty() {
        lock_pending_dead_keys().remove(&hkl_id);
        return LayoutKeyTranslation { text, dead: false };
    }

    lock_pending_dead_keys().remove(&hkl_id);
    if let Some(fallback) = greek_physical_fallback(vk, shift, hkl) {
        return LayoutKeyTranslation {
            text: fallback,
            dead: false,
        };
    }
    LayoutKeyTranslation {
        text: String::new(),
        dead: false,
    }
}

/// Cancel a pending dead key in the current thread's keyboard layout state.
pub fn reset_layout_compose_state(hkl_value: Option<u64>) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VK_TO_VSC, VK_SPACE,
    };

    let hkl = match hkl_value {
        Some(v) if v != 0 => HKL(v as _),
        _ => active_hkl(),
    };
    let hkl_id = hkl.0 as u64;
    lock_pending_dead_keys().remove(&hkl_id);

    unsafe {
        let scan = MapVirtualKeyExW(VK_SPACE.0 as u32, MAPVK_VK_TO_VSC, hkl);
        let state = [0u8; 256];
        let mut buf = [0u16; 8];
        let _ = ToUnicodeEx(VK_SPACE.0 as u32, scan, &state, &mut buf, 0, hkl);
    }
}

