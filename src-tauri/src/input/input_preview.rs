//! Live thumbnail of the focused external input field for the keyboard UI.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder, RgbImage};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN,
};

use super::focus_target::{get_input_target_bounds, has_input_target, ScreenRect};

const FRAME_INTERVAL: Duration = Duration::from_millis(125);
const JPEG_QUALITY: u8 = 72;
const PADDING: i32 = 8;
const MAX_CAPTURE_WIDTH: i32 = 640;
const MAX_CAPTURE_HEIGHT: i32 = 120;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static WORKER_STARTED: AtomicBool = AtomicBool::new(false);
static DIRTY: AtomicBool = AtomicBool::new(false);
static WORKER_LOCK: Mutex<()> = Mutex::new(());
static WORKER_CV: Condvar = Condvar::new();
static PREVIEW_ENABLED: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Clone, Serialize)]
struct InputPreviewFramePayload {
    data_url: String,
    width: u32,
    height: u32,
}

pub fn init(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
    ensure_worker();
    notify_worker();
}

pub fn set_enabled(enabled: bool) {
    PREVIEW_ENABLED.store(enabled, Ordering::Release);
    if !enabled {
        emit_cleared();
    }
    notify_worker();
}

pub fn notify_bounds_changed() {
    notify_worker();
}

fn notify_worker() {
    DIRTY.store(true, Ordering::Release);
    let _guard = WORKER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    WORKER_CV.notify_one();
}

fn ensure_worker() {
    if WORKER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = thread::Builder::new()
        .name("reach-input-preview".into())
        .spawn(preview_loop);
}

fn preview_loop() {
    loop {
        {
            let guard = WORKER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let _guard = WORKER_CV
                .wait_timeout(guard, FRAME_INTERVAL)
                .unwrap_or_else(|e| e.into_inner());
        }
        DIRTY.store(false, Ordering::Release);

        if !PREVIEW_ENABLED.load(Ordering::Acquire) {
            continue;
        }
        if companion_session_live() {
            emit_cleared();
            continue;
        }
        if !has_input_target() {
            emit_cleared();
            continue;
        }
        let Some(bounds) = get_input_target_bounds() else {
            emit_cleared();
            continue;
        };
        match capture_region_jpeg(&bounds) {
            Ok((jpeg, width, height)) => {
                let b64 = STANDARD.encode(jpeg);
                let data_url = format!("data:image/jpeg;base64,{b64}");
                if let Some(app) = APP_HANDLE.get() {
                    let _ = app.emit(
                        "input-preview-frame",
                        InputPreviewFramePayload {
                            data_url,
                            width,
                            height,
                        },
                    );
                }
            }
            Err(e) => {
                eprintln!("input preview capture failed: {e}");
            }
        }
    }
}

fn companion_session_live() -> bool {
    let Some(app) = APP_HANDLE.get() else {
        return false;
    };
    app.try_state::<crate::companion::CompanionBridge>()
        .map(|bridge| bridge.session().tablet_audio_active())
        .unwrap_or(false)
}

fn emit_cleared() {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("input-preview-cleared", ());
    }
}

fn capture_region_jpeg(bounds: &ScreenRect) -> Result<(Vec<u8>, u32, u32), String> {
    let rect = padded_clamped_rect(bounds);
    if rect.width <= 0 || rect.height <= 0 {
        return Err("empty capture rect".into());
    }

    let (src_w, src_h) = (rect.width, rect.height);
    let (dest_w, dest_h) = scale_to_max(src_w, src_h, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT);

    let rgba = capture_screen_bgra(rect.left, rect.top, src_w, src_h)?;
    let rgb = bgra_to_rgb(&rgba, src_w as u32, src_h as u32);

    let img = if dest_w == src_w && dest_h == src_h {
        rgb
    } else {
        image::imageops::resize(
            &rgb,
            dest_w as u32,
            dest_h as u32,
            image::imageops::FilterType::Triangle,
        )
    };

    let mut jpeg = Vec::new();
    let encoder = JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY);
    encoder
        .write_image(
            img.as_raw(),
            img.width(),
            img.height(),
            ExtendedColorType::Rgb8,
        )
        .map_err(|e| e.to_string())?;

    Ok((jpeg, img.width(), img.height()))
}

struct CaptureRect {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

fn padded_clamped_rect(bounds: &ScreenRect) -> CaptureRect {
    let vx = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let vy = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let vw = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let vh = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };

    let mut left = bounds.left.saturating_sub(PADDING);
    let mut top = bounds.top.saturating_sub(PADDING);
    let mut right = bounds.left.saturating_add(bounds.width).saturating_add(PADDING);
    let mut bottom = bounds.top.saturating_add(bounds.height).saturating_add(PADDING);

    left = left.max(vx);
    top = top.max(vy);
    right = right.min(vx.saturating_add(vw));
    bottom = bottom.min(vy.saturating_add(vh));

    CaptureRect {
        left,
        top,
        width: (right - left).max(0),
        height: (bottom - top).max(0),
    }
}

fn scale_to_max(width: i32, height: i32, max_w: i32, max_h: i32) -> (i32, i32) {
    if width <= max_w && height <= max_h {
        return (width, height);
    }
    let scale_w = max_w as f64 / width as f64;
    let scale_h = max_h as f64 / height as f64;
    let scale = scale_w.min(scale_h);
    (
        ((width as f64) * scale).round().max(1.0) as i32,
        ((height as f64) * scale).round().max(1.0) as i32,
    )
}

fn capture_screen_bgra(x: i32, y: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
    unsafe {
        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("GetDC failed".into());
        }

        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err("CreateCompatibleDC failed".into());
        }

        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err("CreateCompatibleBitmap failed".into());
        }

        let old = SelectObject(mem_dc, HGDIOBJ(bitmap.0 as _));
        let copied = BitBlt(mem_dc, 0, 0, width, height, screen_dc, x, y, SRCCOPY);
        SelectObject(mem_dc, old);

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            bmiColors: [Default::default()],
        };

        let stride = (width * 4) as usize;
        let mut pixels = vec![0u8; stride * height as usize];
        let lines = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        let _ = DeleteObject(HGDIOBJ(bitmap.0 as _));
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);

        if lines == 0 || copied.is_err() {
            return Err("screen capture failed".into());
        }

        Ok(pixels)
    }
}

fn bgra_to_rgb(bgra: &[u8], width: u32, height: u32) -> RgbImage {
    let mut rgb = RgbImage::new(width, height);
    for y in 0..height {
        for x in 0..width {
            let i = ((y * width + x) * 4) as usize;
            if i + 2 >= bgra.len() {
                continue;
            }
            rgb.put_pixel(x, y, image::Rgb([bgra[i + 2], bgra[i + 1], bgra[i]]));
        }
    }
    rgb
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_to_max_preserves_aspect_ratio() {
        let (w, h) = scale_to_max(1280, 200, 640, 120);
        assert_eq!(w, 640);
        assert_eq!(h, 100);
    }

    #[test]
    fn padded_clamped_rect_stays_on_screen() {
        let bounds = ScreenRect {
            left: -10,
            top: 5,
            width: 100,
            height: 40,
        };
        let rect = padded_clamped_rect(&bounds);
        assert!(rect.width > 0);
        assert!(rect.height > 0);
    }
}
