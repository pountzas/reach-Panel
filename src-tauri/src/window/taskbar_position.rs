//! Windows taskbar edge automation via Explorer StuckRects3 / MMStuckRects3 registry settings.
//!
//! Windows 10: StuckRects3 `Settings` byte 12 (0=left, 1=top, 2=right, 3=bottom) + Explorer restart.
//! Windows 11: per-monitor `MMStuckRects3` values; primary also uses `StuckRects3`. Changes apply to
//! the monitor where ReachPanel runs (extended) or all mirrored copies of that display (duplicate).

use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

use super::taskbar::{collect_tray_rects, RectI};
use super::{list_monitors, monitor_for_rect, monitors_overlap, MonitorInfo};

const STUCK_RECTS_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3";
const MM_STUCK_RECTS_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MMStuckRects3";
const SETTINGS_VALUE: &str = "Settings";
const POSITION_BYTE_INDEX: usize = 12;
const TRAY_EDGE_TOLERANCE_PX: i32 = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskbarPosition {
    Left,
    Top,
    Right,
    Bottom,
}

impl TaskbarPosition {
    fn byte(self) -> u8 {
        match self {
            Self::Left => 0,
            Self::Top => 1,
            Self::Right => 2,
            Self::Bottom => 3,
        }
    }

    fn from_byte(byte: u8) -> Option<Self> {
        match byte {
            0 => Some(Self::Left),
            1 => Some(Self::Top),
            2 => Some(Self::Right),
            3 => Some(Self::Bottom),
            _ => None,
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "left" => Some(Self::Left),
            "top" => Some(Self::Top),
            "right" => Some(Self::Right),
            "bottom" => Some(Self::Bottom),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Top => "top",
            Self::Right => "right",
            Self::Bottom => "bottom",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskbarPositionResult {
    pub success: bool,
    pub applied: bool,
    pub message: String,
    pub current: Option<TaskbarPosition>,
    pub requested: Option<TaskbarPosition>,
}

#[derive(Debug, Clone, Default)]
struct RegistryBackup {
    stuck_rects_settings: Option<Vec<u8>>,
    mm_stuck_rects: HashMap<String, Vec<u8>>,
}

/// Full monitor bounds (`rcMonitor`) used to match `MMStuckRects3` registry value names.
#[derive(Debug, Clone)]
struct MonitorFrame {
    id: u32,
    is_primary: bool,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    #[allow(dead_code)]
    device_name: String,
}

impl MonitorFrame {
    fn width(&self) -> i32 {
        self.right.saturating_sub(self.left)
    }

    fn height(&self) -> i32 {
        self.bottom.saturating_sub(self.top)
    }

    fn matches_rc_monitor(&self, left: i32, top: i32, right: i32, bottom: i32) -> bool {
        self.left == left && self.top == top && self.right == right && self.bottom == bottom
    }
}

fn list_monitor_frames() -> Vec<MonitorFrame> {
    use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, MONITORINFO, MONITORINFOEXW,
    };

    struct Collector {
        frames: Vec<MonitorFrame>,
        index: u32,
    }

    unsafe extern "system" fn enum_proc(
        _hmonitor: windows::Win32::Graphics::Gdi::HMONITOR,
        _hdc: windows::Win32::Graphics::Gdi::HDC,
        _rect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let collector = &mut *(lparam.0 as *mut Collector);
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(_hmonitor, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
            let rc = info.monitorInfo.rcMonitor;
            let device = String::from_utf16_lossy(
                &info.szDevice[..info
                    .szDevice
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(info.szDevice.len())],
            );
            collector.frames.push(MonitorFrame {
                id: collector.index,
                is_primary: info.monitorInfo.dwFlags & 1 != 0,
                left: rc.left,
                top: rc.top,
                right: rc.right,
                bottom: rc.bottom,
                device_name: device,
            });
            collector.index += 1;
        }
        BOOL(1)
    }

    let mut collector = Collector {
        frames: Vec::new(),
        index: 0,
    };
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(enum_proc),
            LPARAM(&mut collector as *mut _ as isize),
        );
    }
    collector.frames
}

fn parse_localdisplay_key(key: &str) -> Option<(i32, i32, i32, i32)> {
    let inner = key.strip_prefix("LOCALDISPLAY(")?.strip_suffix(')')?;
    let parts: Vec<i32> = inner
        .split(',')
        .filter_map(|part| part.trim().parse().ok())
        .collect();
    if parts.len() == 4 {
        Some((parts[0], parts[1], parts[2], parts[3]))
    } else {
        None
    }
}

/// Map each monitor id to its `MMStuckRects3` registry value name.
fn build_mm_key_map(
    keys: &HashMap<String, Vec<u8>>,
    monitors: &[MonitorFrame],
) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    let mut unassigned_keys: Vec<String> = keys.keys().cloned().collect();

    for key in keys.keys() {
        if let Some((left, top, right, bottom)) = parse_localdisplay_key(key) {
            for monitor in monitors {
                if monitor.matches_rc_monitor(left, top, right, bottom) && !map.contains_key(&monitor.id)
                {
                    map.insert(monitor.id, key.clone());
                    unassigned_keys.retain(|k| k != key);
                }
            }
        }
    }

    for key in unassigned_keys.clone() {
        if key.starts_with("Default_Monitor") {
            if let Some(primary) = monitors.iter().find(|m| m.is_primary) {
                if !map.contains_key(&primary.id) {
                    map.insert(primary.id, key.clone());
                    unassigned_keys.retain(|k| k != &key);
                }
            }
        }
    }

    let mut unassigned_monitors: Vec<&MonitorFrame> =
        monitors.iter().filter(|m| !map.contains_key(&m.id)).collect();
    unassigned_monitors.sort_by_key(|m| m.id);
    unassigned_keys.sort();
    for (monitor, key) in unassigned_monitors.iter().zip(unassigned_keys.iter()) {
        map.insert(monitor.id, key.clone());
    }

    map
}

/// Extended: only the chosen monitor. Mirror/duplicate: every monitor in the overlap group.
fn effective_target_monitor_ids(monitor_id: u32, monitors: &[MonitorInfo]) -> Vec<u32> {
    let Some(target) = monitors.iter().find(|m| m.id == monitor_id) else {
        return vec![monitor_id];
    };
    if !target.is_mirror_duplicate {
        return vec![monitor_id];
    }
    monitors
        .iter()
        .filter(|m| monitors_overlap(m, target))
        .map(|m| m.id)
        .collect()
}

fn resolve_monitor_id(monitor_id: Option<u32>) -> u32 {
    if let Some(id) = monitor_id {
        return id;
    }
    list_monitors()
        .into_iter()
        .find(|m| m.is_primary)
        .map(|m| m.id)
        .unwrap_or(0)
}

fn monitor_frame<'a>(frames: &'a [MonitorFrame], id: u32) -> Option<&'a MonitorFrame> {
    frames.iter().find(|m| m.id == id)
}

fn windows_build_number() -> u32 {
    use windows::Win32::System::SystemInformation::{GetVersionExW, OSVERSIONINFOW};

    unsafe {
        let mut info = OSVERSIONINFOW {
            dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
            ..Default::default()
        };
        if GetVersionExW(&mut info).is_ok() {
            return info.dwBuildNumber;
        }
    }
    0
}

fn is_windows_11() -> bool {
    windows_build_number() >= 22000
}

fn position_supported(position: TaskbarPosition) -> bool {
    if !is_windows_11() {
        return true;
    }
    !matches!(position, TaskbarPosition::Left | TaskbarPosition::Right)
}

fn set_position_byte(data: &mut [u8], position: TaskbarPosition) -> Result<(), String> {
    if data.len() <= POSITION_BYTE_INDEX {
        return Err("Taskbar Settings value is too short".to_string());
    }
    data[POSITION_BYTE_INDEX] = position.byte();
    Ok(())
}

fn read_registry_binary(hkey_path: &str, value_name: &str) -> Result<Vec<u8>, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_READ, REG_BINARY,
    };

    let path_wide: Vec<u16> = hkey_path.encode_utf16().chain(std::iter::once(0)).collect();
    let value_wide: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut hkey = Default::default();
        let open = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(path_wide.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        );
        if open != ERROR_SUCCESS {
            return Err(format!("Registry key not found: {hkey_path}"));
        }

        let mut data_type = REG_BINARY;
        let mut size = 0u32;
        let size_query = RegQueryValueExW(
            hkey,
            PCWSTR(value_wide.as_ptr()),
            None,
            Some(&mut data_type),
            None,
            Some(&mut size),
        );
        if size_query != ERROR_SUCCESS || size == 0 {
            let _ = RegCloseKey(hkey);
            return Err(format!("Registry value not found: {hkey_path}\\{value_name}"));
        }

        let mut data = vec![0u8; size as usize];
        let query = RegQueryValueExW(
            hkey,
            PCWSTR(value_wide.as_ptr()),
            None,
            Some(&mut data_type),
            Some(data.as_mut_ptr()),
            Some(&mut size),
        );
        let _ = RegCloseKey(hkey);
        if query != ERROR_SUCCESS {
            return Err(format!("Failed to read registry value: {hkey_path}\\{value_name}"));
        }
        data.truncate(size as usize);
        Ok(data)
    }
}

fn write_registry_binary(hkey_path: &str, value_name: &str, data: &[u8]) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_BINARY,
    };

    let path_wide: Vec<u16> = hkey_path.encode_utf16().chain(std::iter::once(0)).collect();
    let value_wide: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut hkey = Default::default();
        let open = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(path_wide.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        );
        if open != ERROR_SUCCESS {
            return Err(format!("Registry key not writable: {hkey_path}"));
        }

        let set = RegSetValueExW(
            hkey,
            PCWSTR(value_wide.as_ptr()),
            0,
            REG_BINARY,
            Some(data),
        );
        let _ = RegCloseKey(hkey);
        if set != ERROR_SUCCESS {
            return Err(format!("Failed to write registry value: {hkey_path}\\{value_name}"));
        }
        Ok(())
    }
}

fn read_mm_stuck_rects() -> HashMap<String, Vec<u8>> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_READ,
        REG_BINARY,
    };

    let path_wide: Vec<u16> = MM_STUCK_RECTS_PATH
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut hkey = Default::default();
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(path_wide.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        ) != ERROR_SUCCESS
        {
            return HashMap::new();
        }

        let mut out = HashMap::new();
        let mut index = 0u32;
        loop {
            let mut name_buf = vec![0u16; 256];
            let mut name_len = (name_buf.len() - 1) as u32;
            let mut data_type_raw = 0u32;
            let mut data_size = 0u32;

            let enum_result = RegEnumValueW(
                hkey,
                index,
                PWSTR(name_buf.as_mut_ptr()),
                &mut name_len,
                None,
                Some(&mut data_type_raw),
                None,
                Some(&mut data_size),
            );
            if enum_result == ERROR_NO_MORE_ITEMS {
                break;
            }
            if enum_result != ERROR_SUCCESS {
                index += 1;
                continue;
            }

            let value_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
            if data_type_raw == REG_BINARY.0 && data_size as usize > POSITION_BYTE_INDEX {
                let mut query_name: Vec<u16> =
                    value_name.encode_utf16().chain(std::iter::once(0)).collect();
                let mut data = vec![0u8; data_size as usize];
                let mut query_type = REG_BINARY;
                let mut query_size = data_size;
                if RegQueryValueExW(
                    hkey,
                    PCWSTR(query_name.as_mut_ptr()),
                    None,
                    Some(&mut query_type),
                    Some(data.as_mut_ptr()),
                    Some(&mut query_size),
                ) == ERROR_SUCCESS
                {
                    data.truncate(query_size as usize);
                    out.insert(value_name, data);
                }
            }
            index += 1;
        }

        let _ = RegCloseKey(hkey);
        out
    }
}

fn write_mm_stuck_rects(values: &HashMap<String, Vec<u8>>) -> Result<(), String> {
    for (name, data) in values {
        write_registry_binary(MM_STUCK_RECTS_PATH, name, data)?;
    }
    Ok(())
}

fn backup_registry_for_targets(touched_mm_keys: &[String]) -> RegistryBackup {
    let mm_stuck_rects = read_mm_stuck_rects();
    let filtered = touched_mm_keys
        .iter()
        .filter_map(|key| mm_stuck_rects.get(key).map(|data| (key.clone(), data.clone())))
        .collect();
    RegistryBackup {
        stuck_rects_settings: read_registry_binary(STUCK_RECTS_PATH, SETTINGS_VALUE).ok(),
        mm_stuck_rects: filtered,
    }
}

fn restore_registry(backup: &RegistryBackup) -> Result<(), String> {
    if let Some(data) = &backup.stuck_rects_settings {
        write_registry_binary(STUCK_RECTS_PATH, SETTINGS_VALUE, data)?;
    }
    if !backup.mm_stuck_rects.is_empty() {
        write_mm_stuck_rects(&backup.mm_stuck_rects)?;
    }
    Ok(())
}

fn write_position_to_registry(
    position: TaskbarPosition,
    target_ids: &[u32],
    frames: &[MonitorFrame],
    mm_key_map: &HashMap<u32, String>,
) -> Result<Vec<String>, String> {
    let mm_values = read_mm_stuck_rects();
    let mut touched_keys = Vec::new();

    let primary_targeted = target_ids.iter().any(|id| {
        frames
            .iter()
            .any(|frame| frame.id == *id && frame.is_primary)
    });

    if primary_targeted {
        let mut stuck = read_registry_binary(STUCK_RECTS_PATH, SETTINGS_VALUE)?;
        set_position_byte(&mut stuck, position)?;
        write_registry_binary(STUCK_RECTS_PATH, SETTINGS_VALUE, &stuck)?;
    }

    let mut keys_to_write = HashMap::new();
    for &id in target_ids {
        let Some(key) = mm_key_map.get(&id) else {
            continue;
        };
        let template = mm_values
            .get(key)
            .cloned()
            .or_else(|| read_registry_binary(STUCK_RECTS_PATH, SETTINGS_VALUE).ok());
        let Some(mut data) = template else {
            continue;
        };
        set_position_byte(&mut data, position)?;
        keys_to_write.insert(key.clone(), data);
        touched_keys.push(key.clone());
    }

    if !keys_to_write.is_empty() {
        write_mm_stuck_rects(&keys_to_write)?;
    } else if primary_targeted {
        // Single-monitor setups may only have StuckRects3.
    } else {
        return Err(format!(
            "No MMStuckRects3 registry entry found for monitor id {}",
            target_ids
                .first()
                .copied()
                .map(|id| id.to_string())
                .unwrap_or_else(|| "?".to_string())
        ));
    }

    if primary_targeted && windows_build_number() >= 26300 {
        let _ = write_taskbar_location_dword(position);
    }

    Ok(touched_keys)
}

fn write_taskbar_location_dword(position: TaskbarPosition) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_DWORD,
    };

    const ADVANCED_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced";
    const TASKBAR_LOCATION: &str = "TaskbarLocation";

    let path_wide: Vec<u16> = ADVANCED_PATH.encode_utf16().chain(std::iter::once(0)).collect();
    let value_wide: Vec<u16> = TASKBAR_LOCATION
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut hkey = Default::default();
        let open = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(path_wide.as_ptr()),
            0,
            KEY_SET_VALUE,
            &mut hkey,
        );
        if open != ERROR_SUCCESS {
            return Ok(());
        }

        let value = position.byte() as u32;
        let bytes = value.to_le_bytes();
        let set = RegSetValueExW(
            hkey,
            PCWSTR(value_wide.as_ptr()),
            0,
            REG_DWORD,
            Some(&bytes),
        );
        let _ = RegCloseKey(hkey);
        if set != ERROR_SUCCESS {
            return Ok(());
        }
    }

    Ok(())
}

fn monitor_id_for_tray(tray: RectI, frames: &[MonitorFrame]) -> Option<u32> {
    let cx = tray.left + tray.width() / 2;
    let cy = tray.top + tray.height() / 2;
    let mut best_id = None;
    let mut best_area: i64 = 0;
    for frame in frames {
        let ix1 = cx.max(frame.left);
        let iy1 = cy.max(frame.top);
        let ix2 = (tray.right).min(frame.right);
        let iy2 = (tray.bottom).min(frame.bottom);
        let area = if ix2 > ix1 && iy2 > iy1 {
            (ix2 - ix1) as i64 * (iy2 - iy1) as i64
        } else {
            // Center point containment fallback.
            if cx >= frame.left && cx < frame.right && cy >= frame.top && cy < frame.bottom {
                1
            } else {
                0
            }
        };
        if area > best_area {
            best_area = area;
            best_id = Some(frame.id);
        }
    }
    best_id
}

fn detect_taskbar_position_for_tray(tray: RectI, frame: &MonitorFrame) -> Option<TaskbarPosition> {
    let screen_w = frame.width();
    let screen_h = frame.height();
    if screen_w <= 0 || screen_h <= 0 {
        return None;
    }

    let w = tray.width();
    let h = tray.height();
    if w <= 0 || h <= 0 {
        return None;
    }

    let rel_top = tray.top - frame.top;
    let rel_bottom = frame.bottom - tray.bottom;
    let rel_left = tray.left - frame.left;
    let rel_right = frame.right - tray.right;

    if w > h {
        if rel_top <= TRAY_EDGE_TOLERANCE_PX {
            Some(TaskbarPosition::Top)
        } else if rel_bottom <= TRAY_EDGE_TOLERANCE_PX {
            Some(TaskbarPosition::Bottom)
        } else {
            None
        }
    } else if rel_left <= TRAY_EDGE_TOLERANCE_PX {
        Some(TaskbarPosition::Left)
    } else if rel_right <= TRAY_EDGE_TOLERANCE_PX {
        Some(TaskbarPosition::Right)
    } else {
        None
    }
}

fn get_taskbar_position_from_registry_for_monitor(
    monitor_id: u32,
    frames: &[MonitorFrame],
    mm_key_map: &HashMap<u32, String>,
) -> Option<TaskbarPosition> {
    let key = mm_key_map.get(&monitor_id)?;
    let data = read_mm_stuck_rects().get(key)?.clone();
    let byte = *data.get(POSITION_BYTE_INDEX)?;
    TaskbarPosition::from_byte(byte).or_else(|| {
        if frames.iter().any(|f| f.id == monitor_id && f.is_primary) {
            get_taskbar_position_from_registry()
        } else {
            None
        }
    })
}

pub fn get_taskbar_position_for_monitor(monitor_id: u32) -> Option<TaskbarPosition> {
    let frames = list_monitor_frames();
    let mm_key_map = build_mm_key_map(&read_mm_stuck_rects(), &frames);

    for tray in collect_tray_rects() {
        let Some(tray_monitor) = monitor_id_for_tray(tray, &frames) else {
            continue;
        };
        if tray_monitor != monitor_id {
            continue;
        }
        if let Some(frame) = monitor_frame(&frames, monitor_id) {
            if let Some(pos) = detect_taskbar_position_for_tray(tray, frame) {
                return Some(pos);
            }
        }
    }

    get_taskbar_position_from_registry_for_monitor(monitor_id, &frames, &mm_key_map)
}

pub fn get_taskbar_position_from_registry() -> Option<TaskbarPosition> {
    let data = read_registry_binary(STUCK_RECTS_PATH, SETTINGS_VALUE).ok()?;
    let byte = *data.get(POSITION_BYTE_INDEX)?;
    TaskbarPosition::from_byte(byte)
}

#[allow(dead_code)]
pub fn get_taskbar_position() -> Option<TaskbarPosition> {
    let monitor_id = resolve_monitor_id(None);
    get_taskbar_position_for_monitor(monitor_id)
}

#[allow(dead_code)]
pub fn get_taskbar_position_for_window(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Option<TaskbarPosition> {
    let monitors = list_monitors();
    let monitor_id = monitor_for_rect(&monitors, x, y, width, height);
    get_taskbar_position_for_monitor(monitor_id)
}

fn restart_explorer() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::time::Duration;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let kill = Command::new("taskkill")
        .args(["/f", "/im", "explorer.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to stop Explorer: {e}"))?;

    let exit_code = kill.status.code().unwrap_or(-1);
    if !kill.status.success() && exit_code != 128 {
        return Err(format!("Failed to stop Explorer (exit code {exit_code})"));
    }

    std::thread::sleep(Duration::from_millis(500));

    let explorer = std::env::var("WINDIR")
        .map(|windir| PathBuf::from(windir).join("explorer.exe"))
        .unwrap_or_else(|_| PathBuf::from(r"C:\Windows\explorer.exe"));

    Command::new(&explorer)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to start Explorer: {e}"))?;

    std::thread::sleep(Duration::from_millis(1200));
    Ok(())
}

fn win11_unsupported_message(requested: TaskbarPosition) -> String {
    format!(
        "Windows 11 kept the taskbar at the bottom — moving it to {} is not supported on this build. \
         Microsoft removed registry-based taskbar positioning in most Windows 11 releases; \
         use Settings → Personalization → Taskbar on Insider 25H2+ if available, or keep the taskbar at the bottom.",
        requested.as_str()
    )
}

pub fn apply_taskbar_position_for_monitor(
    position: TaskbarPosition,
    monitor_id: u32,
) -> TaskbarPositionResult {
    let monitors = list_monitors();
    let target_ids = effective_target_monitor_ids(monitor_id, &monitors);
    let frames = list_monitor_frames();
    let mm_key_map = build_mm_key_map(&read_mm_stuck_rects(), &frames);
    let current = get_taskbar_position_for_monitor(monitor_id);

    if !position_supported(position) {
        return TaskbarPositionResult {
            success: false,
            applied: false,
            message: "Left and right taskbar positions are not supported on Windows 11.".to_string(),
            current,
            requested: Some(position),
        };
    }

    if current == Some(position) {
        return TaskbarPositionResult {
            success: true,
            applied: false,
            message: "Taskbar is already in the requested position on this monitor".to_string(),
            current,
            requested: Some(position),
        };
    }

    let touched_mm_keys: Vec<String> = target_ids
        .iter()
        .filter_map(|id| mm_key_map.get(id).cloned())
        .collect();
    let backup = backup_registry_for_targets(&touched_mm_keys);

    if let Err(message) = write_position_to_registry(position, &target_ids, &frames, &mm_key_map) {
        return TaskbarPositionResult {
            success: false,
            applied: false,
            message,
            current,
            requested: Some(position),
        };
    }

    if let Err(message) = restart_explorer() {
        let _ = restore_registry(&backup);
        let _ = restart_explorer();
        return TaskbarPositionResult {
            success: false,
            applied: false,
            message,
            current: get_taskbar_position_for_monitor(monitor_id),
            requested: Some(position),
        };
    }

    let detected = get_taskbar_position_for_monitor(monitor_id);
    if detected != Some(position) {
        let _ = restore_registry(&backup);
        let _ = restart_explorer();
        let actual = get_taskbar_position_for_monitor(monitor_id);
        let message = if is_windows_11() && position != TaskbarPosition::Bottom {
            win11_unsupported_message(position)
        } else {
            format!(
                "The taskbar on this monitor stayed at {} instead of {}.",
                actual
                    .map(|p| p.as_str())
                    .unwrap_or("its previous position"),
                position.as_str()
            )
        };
        return TaskbarPositionResult {
            success: false,
            applied: false,
            message,
            current: actual,
            requested: Some(position),
        };
    }

    TaskbarPositionResult {
        success: true,
        applied: true,
        message: "Taskbar position updated on this monitor".to_string(),
        current: detected,
        requested: Some(position),
    }
}

#[allow(dead_code)]
pub fn apply_taskbar_position(position: TaskbarPosition) -> TaskbarPositionResult {
    apply_taskbar_position_for_monitor(position, resolve_monitor_id(None))
}

pub fn apply_taskbar_position_from_str(
    value: &str,
    monitor_id: Option<u32>,
) -> Result<TaskbarPositionResult, String> {
    let position = TaskbarPosition::parse(value)
        .ok_or_else(|| format!("Unknown taskbar position: {value}"))?;
    Ok(apply_taskbar_position_for_monitor(
        position,
        resolve_monitor_id(monitor_id),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_byte_mapping() {
        assert_eq!(TaskbarPosition::Left.byte(), 0);
        assert_eq!(TaskbarPosition::Top.byte(), 1);
        assert_eq!(TaskbarPosition::Right.byte(), 2);
        assert_eq!(TaskbarPosition::Bottom.byte(), 3);
    }

    #[test]
    fn position_from_byte_roundtrip() {
        for pos in [
            TaskbarPosition::Left,
            TaskbarPosition::Top,
            TaskbarPosition::Right,
            TaskbarPosition::Bottom,
        ] {
            assert_eq!(TaskbarPosition::from_byte(pos.byte()), Some(pos));
        }
        assert_eq!(TaskbarPosition::from_byte(9), None);
    }

    #[test]
    fn parse_position_strings() {
        assert_eq!(TaskbarPosition::parse("bottom"), Some(TaskbarPosition::Bottom));
        assert_eq!(TaskbarPosition::parse("TOP"), Some(TaskbarPosition::Top));
        assert_eq!(TaskbarPosition::parse("invalid"), None);
    }

    #[test]
    fn horizontal_tray_detection_geometry() {
        let top = RectI {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 48,
        };
        assert!(top.is_horizontal_bar());
        assert_eq!(top.height(), 48);
    }

    #[test]
    fn parse_localdisplay_registry_key() {
        assert_eq!(
            parse_localdisplay_key("LOCALDISPLAY(-3840,0,-1920,1080)"),
            Some((-3840, 0, -1920, 1080))
        );
        assert_eq!(parse_localdisplay_key("Default_Monitor#abc"), None);
    }

    #[test]
    fn build_mm_key_map_matches_localdisplay_monitor() {
        let mut keys = HashMap::new();
        keys.insert(
            "LOCALDISPLAY(-3840,0,-1920,1080)".to_string(),
            vec![0; 20],
        );
        keys.insert("Default_Monitor#1".to_string(), vec![0; 20]);
        let monitors = vec![
            MonitorFrame {
                id: 0,
                is_primary: true,
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
                device_name: String::new(),
            },
            MonitorFrame {
                id: 1,
                is_primary: false,
                left: -3840,
                top: 0,
                right: -1920,
                bottom: 1080,
                device_name: String::new(),
            },
        ];
        let map = build_mm_key_map(&keys, &monitors);
        assert_eq!(
            map.get(&1),
            Some(&"LOCALDISPLAY(-3840,0,-1920,1080)".to_string())
        );
        assert_eq!(map.get(&0), Some(&"Default_Monitor#1".to_string()));
    }

    #[test]
    fn detect_taskbar_top_on_secondary_monitor_coords() {
        let frame = MonitorFrame {
            id: 1,
            is_primary: false,
            left: -3840,
            top: 0,
            right: -1920,
            bottom: 1080,
            device_name: String::new(),
        };
        let tray = RectI {
            left: -3840,
            top: 0,
            right: -1920,
            bottom: 48,
        };
        assert_eq!(
            detect_taskbar_position_for_tray(tray, &frame),
            Some(TaskbarPosition::Top)
        );
    }
}
