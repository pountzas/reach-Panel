use super::{MonitorInfo, WindowLayout};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

struct MonitorCollector {
    monitors: Vec<MonitorInfo>,
    index: u32,
}

fn monitor_scale_factor(hmonitor: windows::Win32::Graphics::Gdi::HMONITOR) -> f64 {
    let mut dpi_x = 0u32;
    let mut dpi_y = 0u32;
    unsafe {
        if GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).is_ok()
            && dpi_x > 0
        {
            return dpi_x as f64 / 96.0;
        }
    }
    1.0
}

unsafe extern "system" fn monitor_enum_proc(
    hmonitor: windows::Win32::Graphics::Gdi::HMONITOR,
    _hdc: windows::Win32::Graphics::Gdi::HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let collector = &mut *(lparam.0 as *mut MonitorCollector);
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
        let rect = info.monitorInfo.rcWork;
        let name = String::from_utf16_lossy(
            &info.szDevice[..info
                .szDevice
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(info.szDevice.len())],
        );
        collector.monitors.push(MonitorInfo {
            id: collector.index,
            name,
            x: rect.left,
            y: rect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
            is_primary: info.monitorInfo.dwFlags & 1 != 0,
            is_mirror_duplicate: false,
            scale_factor: monitor_scale_factor(hmonitor),
        });
        collector.index += 1;
    }
    BOOL(1)
}

pub fn list_monitors() -> Vec<MonitorInfo> {
    let mut collector = MonitorCollector {
        monitors: Vec::new(),
        index: 0,
    };
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut collector as *mut _ as isize),
        );
    }
    super::mark_mirror_duplicates(&mut collector.monitors);
    collector.monitors
}

/// Pick the monitor with the largest intersection area against the given rect.
/// Returns the first monitor id (or 0) when there is no overlap / empty list.
pub fn monitor_for_rect(monitors: &[super::MonitorInfo], x: i32, y: i32, w: i32, h: i32) -> u32 {
    let mut best_id = monitors.first().map(|m| m.id).unwrap_or(0);
    let mut best_area: i64 = 0;
    let rect_right = x.saturating_add(w);
    let rect_bottom = y.saturating_add(h);

    for monitor in monitors {
        let mx2 = monitor.x.saturating_add(monitor.width);
        let my2 = monitor.y.saturating_add(monitor.height);
        let ix1 = x.max(monitor.x);
        let iy1 = y.max(monitor.y);
        let ix2 = rect_right.min(mx2);
        let iy2 = rect_bottom.min(my2);
        let area = if ix2 > ix1 && iy2 > iy1 {
            (ix2 - ix1) as i64 * (iy2 - iy1) as i64
        } else {
            0
        };
        if area > best_area {
            best_area = area;
            best_id = monitor.id;
        }
    }

    best_id
}

/// Positive client size that fits a Win32 `SetWindowPos` / DIB (`i32`).
/// Inverted or empty spans stay errors so they are not cast to huge `u32`s.
pub fn layout_from_edges(
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
) -> Result<WindowLayout, String> {
    let width = right.checked_sub(left).ok_or_else(|| {
        format!("window width is not a positive i32 (left={left}, right={right})")
    })?;
    let height = bottom.checked_sub(top).ok_or_else(|| {
        format!("window height is not a positive i32 (top={top}, bottom={bottom})")
    })?;
    if width <= 0 {
        return Err(format!(
            "window width is not a positive i32 (left={left}, right={right})"
        ));
    }
    if height <= 0 {
        return Err(format!(
            "window height is not a positive i32 (top={top}, bottom={bottom})"
        ));
    }
    Ok(WindowLayout {
        x: left,
        y: top,
        width: width as u32,
        height: height as u32,
    })
}

/// Reject a layout that cannot be placed without wrapping into a negative GDI size.
pub fn layout_fits_gdi(layout: &WindowLayout) -> Result<(), String> {
    if layout.width == 0 || layout.width > i32::MAX as u32 {
        return Err(format!(
            "window width {} is outside 1..={}",
            layout.width,
            i32::MAX
        ));
    }
    if layout.height == 0 || layout.height > i32::MAX as u32 {
        return Err(format!(
            "window height {} is outside 1..={}",
            layout.height,
            i32::MAX
        ));
    }
    Ok(())
}

pub fn get_window_bounds(hwnd: isize) -> Result<WindowLayout, String> {
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(HWND(hwnd as *mut core::ffi::c_void), &mut rect)
            .map_err(|e| e.to_string())?;
    }
    layout_from_edges(rect.left, rect.top, rect.right, rect.bottom)
}

pub fn set_window_bounds(hwnd: isize, layout: WindowLayout) -> Result<(), String> {
    super::taskbar::set_window_bounds_with_taskbar_lift(hwnd, layout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_or_inverted_edges_are_rejected() {
        let err = layout_from_edges(10, 20, 10, 40).unwrap_err();
        assert!(err.contains("width"), "{err}");
        let err = layout_from_edges(10, 20, 30, 20).unwrap_err();
        assert!(err.contains("height"), "{err}");
        let err = layout_from_edges(100, 0, 50, 80).unwrap_err();
        assert!(err.contains("width"), "{err}");
    }

    #[test]
    fn positive_edges_keep_signed_origin() {
        let layout = layout_from_edges(-1842, 708, -842, 1208).unwrap();
        assert_eq!(
            layout,
            WindowLayout {
                x: -1842,
                y: 708,
                width: 1000,
                height: 500,
            }
        );
    }

    #[test]
    fn gdi_layout_rejects_zero_and_i32_overflow() {
        let zero = WindowLayout {
            x: 0,
            y: 0,
            width: 0,
            height: 10,
        };
        assert!(layout_fits_gdi(&zero).is_err());
        let huge = WindowLayout {
            x: -100,
            y: 0,
            width: i32::MAX as u32 + 1,
            height: 10,
        };
        assert!(layout_fits_gdi(&huge).is_err());
        let ok = WindowLayout {
            x: -1842,
            y: 708,
            width: 400,
            height: 200,
        };
        assert!(layout_fits_gdi(&ok).is_ok());
    }
}
