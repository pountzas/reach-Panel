use super::MonitorInfo;

pub fn list_monitors() -> Vec<MonitorInfo> {
    vec![MonitorInfo {
        id: 0,
        name: "Primary Display".to_string(),
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        is_primary: true,
    }]
}

/// Pick the monitor with the largest intersection area against the given rect.
/// Returns the first monitor id (or 0) when there is no overlap / empty list.
pub fn monitor_for_rect(monitors: &[MonitorInfo], x: i32, y: i32, w: i32, h: i32) -> u32 {
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
