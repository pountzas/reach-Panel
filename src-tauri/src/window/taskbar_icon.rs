//! Windows taskbar button icon (WM_SETICON ICON_BIG).
//!
//! Tauri/wry's `set_icon` only applies `ICON_SMALL` (title bar / Alt+Tab small).
//! The taskbar button uses `ICON_BIG`; when unset, Windows shows the default Tauri glyph
//! even though `icon.ico` is embedded in the exe (Explorer / Start use the file icon).

use tauri::utils::platform::WINDOWS_APP_ICON_RESOURCE_ID;
use windows::Win32::Foundation::HWND;

/// Resource id winres embeds from `bundle.icon` → `icons/icon.ico` (see tauri-build).
pub(crate) fn embedded_app_icon_resource_id() -> u16 {
    WINDOWS_APP_ICON_RESOURCE_ID
}

pub(crate) fn set_taskbar_icon_from_embedded_resource(hwnd: HWND) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        LoadImageW, SendMessageW, ICON_BIG, IMAGE_ICON, LR_DEFAULTSIZE, WM_SETICON,
    };

    let icon = unsafe {
        LoadImageW(
            GetModuleHandleW(None).map_err(|e| e.to_string())?,
            PCWSTR::from_raw(embedded_app_icon_resource_id() as usize as *const u16),
            IMAGE_ICON,
            0,
            0,
            LR_DEFAULTSIZE,
        )
    }
    .map_err(|e| e.to_string())?;

    unsafe {
        SendMessageW(
            hwnd,
            WM_SETICON,
            windows::Win32::Foundation::WPARAM(ICON_BIG as usize),
            windows::Win32::Foundation::LPARAM(icon.0 as isize),
        );
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
