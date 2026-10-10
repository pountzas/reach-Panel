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
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, GetWindowRect, SetWindowDisplayAffinity, SM_CXVIRTUALSCREEN,
    SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WDA_EXCLUDEFROMCAPTURE,
};

use super::focus_target::{
    get_effective_input_hwnd, get_input_target_bounds, has_input_target, is_input_focused,
    ScreenRect,
};

/// `PW_RENDERFULLCONTENT` — needed for Chromium/DWM-composited windows.
const PRINT_FULL_CONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

const FRAME_INTERVAL: Duration = Duration::from_millis(125);
const JPEG_QUALITY: u8 = 72;
const PADDING: i32 = 0;
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

/// Hide ReachPanel from desktop BitBlt so live preview shows the field underneath.
///
/// Uses `WDA_EXCLUDEFROMCAPTURE` (Windows 10 2004+). The window still paints on
/// the monitor; capture APIs omit it so overlapping chrome does not occlude the strip.
pub fn exclude_window_from_capture(hwnd: isize) -> Result<(), String> {
    if hwnd == 0 {
        return Err("invalid hwnd".into());
    }
    unsafe {
        SetWindowDisplayAffinity(
            HWND(hwnd as *mut core::ffi::c_void),
            WDA_EXCLUDEFROMCAPTURE,
        )
        .map_err(|e| e.to_string())
    }
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
    let mut was_companion_live = false;
    loop {
        {
            let guard = WORKER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let _guard = WORKER_CV
                .wait_timeout(guard, FRAME_INTERVAL)
                .unwrap_or_else(|e| e.into_inner());
        }
        DIRTY.store(false, Ordering::Release);

        let companion_live = companion_session_live();
        if companion_live && !was_companion_live {
            // Clear desktop strip once when the tablet takes over; keep capturing.
            emit_cleared();
        }
        was_companion_live = companion_live;

        // Desktop setting may be off; companion still gets frames while live.
        if !PREVIEW_ENABLED.load(Ordering::Acquire) && !companion_live {
            continue;
        }
        match next_preview_action(
            has_input_target() && is_input_focused(),
            get_input_target_bounds(),
        ) {
            PreviewFrameAction::Clear => {
                route_cleared(companion_live);
            }
            PreviewFrameAction::KeepLastFrame => {
                // Transient UIA/bounds miss while the target HWND remains — do not flicker.
            }
            PreviewFrameAction::Capture(bounds) => {
                match capture_region_jpeg(&bounds) {
                    Ok((jpeg, width, height)) => {
                        let b64 = STANDARD.encode(jpeg);
                        let data_url = format!("data:image/jpeg;base64,{b64}");
                        if companion_live {
                            push_frame_to_companion(data_url, width, height);
                        } else if let Some(app) = APP_HANDLE.get() {
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

fn route_cleared(companion_live: bool) {
    if companion_live {
        push_cleared_to_companion();
    } else {
        emit_cleared();
    }
}

fn push_frame_to_companion(data_url: String, width: u32, height: u32) {
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    let Some(bridge) = app.try_state::<crate::companion::CompanionBridge>() else {
        return;
    };
    crate::companion::push_input_preview_frame(&bridge, data_url, width, height);
}

fn push_cleared_to_companion() {
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    let Some(bridge) = app.try_state::<crate::companion::CompanionBridge>() else {
        return;
    };
    crate::companion::push_input_preview_cleared(&bridge);
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

    // Prefer PrintWindow of the target HWND so ReachPanel chrome cannot occlude the strip.
    // Desktop BitBlt is only a last resort (WDA exclusion is unreliable on some Win11 builds).
    let rgba = match get_effective_input_hwnd() {
        Some(hwnd) => capture_window_region_bgra(hwnd, &rect).or_else(|e| {
            eprintln!("input preview window capture failed ({e}); falling back to screen");
            capture_screen_bgra(rect.left, rect.top, src_w, src_h)
        })?,
        None => capture_screen_bgra(rect.left, rect.top, src_w, src_h)?,
    };
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct CaptureRect {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

/// Map a screen-space strip into coordinates relative to a window's screen rect, clipped.
fn window_local_capture_rect(
    screen: CaptureRect,
    window_left: i32,
    window_top: i32,
    window_width: i32,
    window_height: i32,
) -> Option<CaptureRect> {
    if window_width <= 0 || window_height <= 0 || screen.width <= 0 || screen.height <= 0 {
        return None;
    }
    let mut left = screen.left.saturating_sub(window_left);
    let mut top = screen.top.saturating_sub(window_top);
    let mut right = left.saturating_add(screen.width);
    let mut bottom = top.saturating_add(screen.height);

    left = left.max(0);
    top = top.max(0);
    right = right.min(window_width);
    bottom = bottom.min(window_height);

    let width = right.saturating_sub(left);
    let height = bottom.saturating_sub(top);
    if width <= 0 || height <= 0 {
        return None;
    }
    Some(CaptureRect {
        left,
        top,
        width,
        height,
    })
}

/// Crop a BGRA8 buffer (`src_w`×`src_h`) to `crop` (window-local).
fn crop_bgra(
    src: &[u8],
    src_w: i32,
    src_h: i32,
    crop: CaptureRect,
) -> Option<Vec<u8>> {
    if src_w <= 0 || src_h <= 0 || crop.width <= 0 || crop.height <= 0 {
        return None;
    }
    if crop.left < 0
        || crop.top < 0
        || crop.left.saturating_add(crop.width) > src_w
        || crop.top.saturating_add(crop.height) > src_h
    {
        return None;
    }
    let expected = (src_w as usize).saturating_mul(src_h as usize).saturating_mul(4);
    if src.len() < expected {
        return None;
    }
    let mut out = vec![0u8; (crop.width as usize).saturating_mul(crop.height as usize) * 4];
    for row in 0..crop.height as usize {
        let src_off =
            ((crop.top as usize + row) * src_w as usize + crop.left as usize) * 4;
        let dst_off = row * crop.width as usize * 4;
        let len = crop.width as usize * 4;
        out[dst_off..dst_off + len].copy_from_slice(&src[src_off..src_off + len]);
    }
    Some(out)
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

/// Capture `screen_rect` from `hwnd`'s own pixels via PrintWindow (no desktop compositing).
///
/// PrintWindow always paints the full window into the DC from its top-left; a strip-sized
/// bitmap + SetWindowOrgEx does not shift that paint, so we PrintWindow into a full-window
/// buffer then crop. GDI objects are created and released per frame (no long-lived GetDC).
fn capture_window_region_bgra(hwnd: HWND, screen_rect: &CaptureRect) -> Result<Vec<u8>, String> {
    unsafe {
        let mut window_rect = RECT::default();
        GetWindowRect(hwnd, &mut window_rect).map_err(|e| e.to_string())?;
        let win_w = window_rect.right.saturating_sub(window_rect.left);
        let win_h = window_rect.bottom.saturating_sub(window_rect.top);
        let local = window_local_capture_rect(
            *screen_rect,
            window_rect.left,
            window_rect.top,
            win_w,
            win_h,
        )
        .ok_or_else(|| "capture rect does not intersect target window".to_string())?;

        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("GetDC failed".into());
        }
        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err("CreateCompatibleDC failed".into());
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, win_w, win_h);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err("CreateCompatibleBitmap failed".into());
        }

        let old = SelectObject(mem_dc, HGDIOBJ(bitmap.0 as _));
        let printed = PrintWindow(hwnd, mem_dc, PRINT_FULL_CONTENT).as_bool();
        SelectObject(mem_dc, old);

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: win_w,
                biHeight: -win_h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            bmiColors: [Default::default()],
        };

        let stride = (win_w * 4) as usize;
        let mut pixels = vec![0u8; stride * win_h as usize];
        let lines = GetDIBits(
            mem_dc,
            bitmap,
            0,
            win_h as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        let _ = DeleteObject(HGDIOBJ(bitmap.0 as _));
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(None, screen_dc);

        if !printed || lines == 0 {
            return Err("PrintWindow/GetDIBits failed".into());
        }

        // If the strip size matches the original screen rect, crop as-is.
        // When clipped to the window edge, pad/crop to the requested screen size so
        // callers keep a stable (src_w, src_h) buffer.
        let cropped = crop_bgra(&pixels, win_w, win_h, local)
            .ok_or_else(|| "crop after PrintWindow failed".to_string())?;

        if local.width == screen_rect.width && local.height == screen_rect.height {
            return Ok(cropped);
        }

        // Letterbox clipped local crop into the full requested strip size.
        let mut out =
            vec![0u8; (screen_rect.width as usize) * (screen_rect.height as usize) * 4];
        let dst_x = (local.left - (screen_rect.left - window_rect.left)).max(0) as usize;
        let dst_y = (local.top - (screen_rect.top - window_rect.top)).max(0) as usize;
        for row in 0..local.height as usize {
            let src_off = row * local.width as usize * 4;
            let dst_off =
                ((dst_y + row) * screen_rect.width as usize + dst_x) * 4;
            let len = local.width as usize * 4;
            if dst_off + len <= out.len() && src_off + len <= cropped.len() {
                out[dst_off..dst_off + len]
                    .copy_from_slice(&cropped[src_off..src_off + len]);
            }
        }
        Ok(out)
    }
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

/// What the preview worker should do for one tick.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PreviewFrameAction {
    /// Capture a new JPEG for these screen bounds.
    Capture(ScreenRect),
    /// Keep showing the last good frame (transient UIA/bounds miss while target remains).
    KeepLastFrame,
    /// No typing target — clear the strip.
    Clear,
}

/// Decide whether to capture, hold, or clear. Pure — unit-tested without Win32.
///
/// While a target HWND is remembered, a brief `None` from UIA (window drag / scroll)
/// must not clear the strip; only losing the target clears.
pub(crate) fn next_preview_action(
    has_target: bool,
    live_bounds: Option<ScreenRect>,
) -> PreviewFrameAction {
    if !has_target {
        return PreviewFrameAction::Clear;
    }
    match live_bounds {
        Some(bounds) => PreviewFrameAction::Capture(bounds),
        None => PreviewFrameAction::KeepLastFrame,
    }
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

    #[test]
    fn preview_keeps_last_frame_when_bounds_briefly_unavailable() {
        let action = next_preview_action(true, None);
        assert_eq!(action, PreviewFrameAction::KeepLastFrame);
    }

    #[test]
    fn preview_captures_when_live_bounds_available() {
        let bounds = ScreenRect {
            left: 10,
            top: 20,
            width: 320,
            height: 48,
        };
        let action = next_preview_action(true, Some(bounds));
        assert_eq!(action, PreviewFrameAction::Capture(bounds));
    }

    #[test]
    fn preview_clears_only_when_target_is_gone() {
        assert_eq!(next_preview_action(false, None), PreviewFrameAction::Clear);
    }

    #[test]
    fn preview_clears_when_not_focused_even_if_bounds_exist() {
        // Gate passes false (no editable focus) → clear; do not capture stale bounds.
        assert_eq!(
            next_preview_action(
                false,
                Some(ScreenRect {
                    left: 0,
                    top: 0,
                    width: 10,
                    height: 10,
                })
            ),
            PreviewFrameAction::Clear
        );
    }

    #[test]
    fn capture_exclude_affinity_matches_win32() {
        // Guarantees we ask for "omit from capture" (0x11), not WDA_MONITOR black-box (0x1).
        assert_eq!(WDA_EXCLUDEFROMCAPTURE.0, 0x11);
    }

    #[test]
    fn window_local_rect_maps_and_clips_to_window() {
        let screen = CaptureRect {
            left: 150,
            top: 220,
            width: 320,
            height: 48,
        };
        // Window at (100,200) size 800×600 — strip is fully inside.
        let local = window_local_capture_rect(screen, 100, 200, 800, 600).expect("local");
        assert_eq!(
            local,
            CaptureRect {
                left: 50,
                top: 20,
                width: 320,
                height: 48,
            }
        );

        // Strip overhangs the right edge — clip width.
        let overhang = CaptureRect {
            left: 850,
            top: 200,
            width: 100,
            height: 40,
        };
        let clipped = window_local_capture_rect(overhang, 100, 200, 800, 600).expect("clip");
        assert_eq!(clipped.left, 750);
        assert_eq!(clipped.width, 50);
    }

    #[test]
    fn window_local_rect_none_when_no_overlap() {
        let screen = CaptureRect {
            left: 0,
            top: 0,
            width: 50,
            height: 20,
        };
        assert_eq!(window_local_capture_rect(screen, 100, 100, 200, 200), None);
    }

    #[test]
    fn crop_bgra_extracts_sub_rect() {
        // 4×2 BGRA image; each pixel unique in B channel.
        let mut src = vec![0u8; 4 * 2 * 4];
        for i in 0..8 {
            src[i * 4] = i as u8; // B
            src[i * 4 + 1] = 0;
            src[i * 4 + 2] = 0;
            src[i * 4 + 3] = 255;
        }
        let crop = CaptureRect {
            left: 1,
            top: 0,
            width: 2,
            height: 1,
        };
        let out = crop_bgra(&src, 4, 2, crop).expect("crop");
        assert_eq!(out.len(), 2 * 1 * 4);
        assert_eq!(out[0], 1);
        assert_eq!(out[4], 2);
    }
}
