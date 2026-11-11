//! Throttled `main` window event breadcrumbs. Registered beside icon_sync.

use crate::diagnostics::breadcrumbs;
use super::capture_exclude::{self, exclusion_active};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{WebviewWindow, WindowEvent};

const GEOMETRY_MIN_INTERVAL: Duration = Duration::from_millis(200);

static LAST_GEOMETRY: Mutex<Option<Instant>> = Mutex::new(None);

fn allow_geometry_event() -> bool {
    let now = Instant::now();
    let mut last = LAST_GEOMETRY.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(prev) = *last {
        if now.duration_since(prev) < GEOMETRY_MIN_INTERVAL {
            return false;
        }
    }
    *last = Some(now);
    true
}

pub(crate) fn register_main_window_event_logs(window: WebviewWindow) {
    let hwnd = window.hwnd().ok().map(|handle| handle.0 as isize);
    let retried = Arc::new(AtomicBool::new(false));
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(size) => {
            if let Some(hwnd) = hwnd {
                if !exclusion_active() && !retried.swap(true, Ordering::AcqRel) {
                    let _ = capture_exclude::apply_main_window_exclusion(hwnd);
                }
            }
            if !allow_geometry_event() {
                return;
            }
            breadcrumbs::debug(
                "window::events",
                format!("resized {}x{}", size.width, size.height),
            );
        }
        WindowEvent::Moved(position) => {
            if !allow_geometry_event() {
                return;
            }
            breadcrumbs::debug(
                "window::events",
                format!("moved ({}, {})", position.x, position.y),
            );
        }
        WindowEvent::ScaleFactorChanged {
            scale_factor,
            new_inner_size,
            ..
        } => {
            breadcrumbs::info(
                "window::events",
                format!(
                    "scale_factor={scale_factor} inner={}x{}",
                    new_inner_size.width, new_inner_size.height
                ),
            );
        }
        WindowEvent::Focused(focused) => {
            breadcrumbs::debug("window::events", format!("focused={focused}"));
        }
        WindowEvent::CloseRequested { .. } => {
            breadcrumbs::info("window::events", "close_requested");
        }
        WindowEvent::Destroyed => {
            breadcrumbs::info("window::events", "destroyed");
            breadcrumbs::flush();
        }
        _ => {}
    });
}
