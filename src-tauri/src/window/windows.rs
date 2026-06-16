use serde::Serialize;
use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MONITORINFO, MONITORINFOEXW};

use super::MonitorInfo;

struct MonitorCollector {
    monitors: Vec<MonitorInfo>,
    index: u32,
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
        let rect = info.monitorInfo.rcMonitor;
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
    collector.monitors
}
