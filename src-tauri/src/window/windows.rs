use super::{MonitorInfo, WindowLayout};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MONITORINFO, MONITORINFOEXW};
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
        if GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y).is_ok() && dpi_x > 0
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

pub fn get_window_bounds(hwnd: isize) -> Result<WindowLayout, String> {
    let mut rect = RECT::default();
    unsafe {
        GetWindowRect(
            HWND(hwnd as *mut core::ffi::c_void),
            &mut rect,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(WindowLayout {
        x: rect.left,
        y: rect.top,
        width: (rect.right - rect.left) as u32,
        height: (rect.bottom - rect.top) as u32,
    })
}

pub fn set_window_bounds(hwnd: isize, layout: WindowLayout) -> Result<(), String> {
    super::taskbar::set_window_bounds_with_taskbar_lift(hwnd, layout)
}
