//! Windows taskbar button icon (WM_SETICON ICON_BIG).
//!
//! Tauri/wry's `set_icon` only applies `ICON_SMALL` (title bar / Alt+Tab small).
//! The taskbar button uses `ICON_BIG`. WebView2 can reset icons after the webview HWND
//! exists, so callers re-apply on page load and window events until it succeeds once.

use tauri::utils::platform::WINDOWS_APP_ICON_RESOURCE_ID;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{EnumChildWindows, ICON_BIG, ICON_SMALL};

/// Resource id winres embeds from `bundle.icon` → `icons/icon.ico` (see tauri-build).
pub(crate) fn embedded_app_icon_resource_id() -> u16 {
    WINDOWS_APP_ICON_RESOURCE_ID
}

fn load_embedded_app_icon() -> Result<windows::Win32::Foundation::HANDLE, String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{LoadImageW, IMAGE_ICON, LR_DEFAULTSIZE};

    unsafe {
        LoadImageW(
            GetModuleHandleW(None).map_err(|e| e.to_string())?,
            PCWSTR::from_raw(embedded_app_icon_resource_id() as usize as *const u16),
            IMAGE_ICON,
            0,
            0,
            LR_DEFAULTSIZE,
        )
    }
    .map_err(|e| e.to_string())
}

fn set_icon_message(hwnd: HWND, icon: windows::Win32::Foundation::HANDLE, icon_type: isize) {
    use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, WM_SETICON};

    unsafe {
        SendMessageW(
            hwnd,
            WM_SETICON,
            WPARAM(icon_type as usize),
            LPARAM(icon.0 as isize),
        );
    }
}

/// Apply bundled `icon.ico` to both taskbar (`ICON_BIG`) and window (`ICON_SMALL`) HWND slots.
pub(crate) fn apply_embedded_icons_to_hwnd(hwnd: HWND) -> Result<(), String> {
    let icon = load_embedded_app_icon()?;
    set_icon_message(hwnd, icon, ICON_BIG as isize);
    set_icon_message(hwnd, icon, ICON_SMALL as isize);
    Ok(())
}

unsafe extern "system" fn enum_child_icon_proc(hwnd: HWND, _: LPARAM) -> BOOL {
    let _ = apply_embedded_icons_to_hwnd(hwnd);
    BOOL(1)
}

/// Apply to the root window and child HWNDs (WebView2 host).
pub(crate) fn apply_embedded_icons_to_window_tree(root: HWND) -> Result<(), String> {
    apply_embedded_icons_to_hwnd(root)?;
    unsafe {
        let _ = EnumChildWindows(root, Some(enum_child_icon_proc), LPARAM(0));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_app_icon_resource_id_matches_tauri_winres_slot() {
        assert_eq!(embedded_app_icon_resource_id(), 32512);
    }
}
