//! Live thumbnail of the focused external input field for the keyboard UI.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder, RgbImage};
use tauri::ipc::{Channel, InvokeResponseBody};
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
use super::wgc_capture::{self, StripCapture};

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
/// Nested animation pause count from `animate_window_layout`; preview skips GDI while > 0.
static ANIMATIONS_ACTIVE: AtomicUsize = AtomicUsize::new(0);
/// Cleared by the worker; set on enable/disable, clear, companion connect/disconnect, animation end.
static FORCE_FRESH_FRAME: AtomicBool = AtomicBool::new(false);
/// Last logged capture backend (`wgc` / `printwindow` / `bitblt`) for change-only logging.
static LAST_CAPTURE_PATH: Mutex<Option<&'static str>> = Mutex::new(None);
/// Desktop subscriber for binary preview frames (`InvokeResponseBody::Raw`).
static PREVIEW_CHANNEL: Mutex<Option<Channel<InvokeResponseBody>>> = Mutex::new(None);

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
        SetWindowDisplayAffinity(HWND(hwnd as *mut core::ffi::c_void), WDA_EXCLUDEFROMCAPTURE)
            .map_err(|e| e.to_string())
    }
}

pub fn set_enabled(enabled: bool) {
    PREVIEW_ENABLED.store(enabled, Ordering::Release);
    request_fresh_frame(FrameSkipReset::EnabledChanged);
    if !enabled {
        wgc_capture::close_session();
        emit_cleared();
    }
    notify_worker();
}

/// Replace the desktop preview Channel (newer subscriber wins; closed channels are dropped).
pub fn set_preview_channel(channel: Channel<InvokeResponseBody>) {
    let mut guard = PREVIEW_CHANNEL
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *guard = Some(channel);
}

/// Pack `u32` width + `u32` height (little-endian) then JPEG bytes.
pub(crate) fn encode_preview_frame_bytes(jpeg: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + jpeg.len());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(jpeg);
    out
}

/// Begin skipping GDI capture for a window-layout animation (supports nesting).
pub fn begin_animation_pause() {
    ANIMATIONS_ACTIVE.fetch_add(1, Ordering::AcqRel);
}

/// End one animation pause; request a fresh frame when the last nested pause clears.
pub fn end_animation_pause() {
    let prev = ANIMATIONS_ACTIVE.load(Ordering::Acquire);
    if prev == 0 {
        return;
    }
    if ANIMATIONS_ACTIVE.fetch_sub(1, Ordering::AcqRel) == 1 {
        request_fresh_frame(FrameSkipReset::AnimationEnded);
        notify_worker();
    }
}

fn animation_paused() -> bool {
    ANIMATIONS_ACTIVE.load(Ordering::Acquire) > 0
}

pub fn notify_bounds_changed() {
    wgc_capture::note_bounds_changed();
    notify_worker();
}

fn request_fresh_frame(_event: FrameSkipReset) {
    FORCE_FRESH_FRAME.store(true, Ordering::Release);
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
    let mut last_frame: Option<FrameSkipKey> = None;
    loop {
        {
            let guard = WORKER_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let _guard = WORKER_CV
                .wait_timeout(guard, FRAME_INTERVAL)
                .unwrap_or_else(|e| e.into_inner());
        }
        DIRTY.store(false, Ordering::Release);

        if FORCE_FRESH_FRAME.swap(false, Ordering::AcqRel) {
            last_frame = None;
        }

        // Skip GDI while the main window is animating; one fresh frame after it clears.
        if animation_paused() {
            continue;
        }

        let companion_live = companion_session_live();
        let (reset_frame, clear_desktop) =
            companion_transition(was_companion_live, companion_live);
        if reset_frame {
            // Routing changed (tablet took over or left): next capture must emit.
            last_frame = reset_last_frame(if companion_live {
                FrameSkipReset::CompanionConnected
            } else {
                FrameSkipReset::CompanionDisconnected
            });
            if clear_desktop {
                // Clear desktop strip once when the tablet takes over; keep capturing.
                emit_cleared();
            }
        }
        was_companion_live = companion_live;

        // Desktop setting may be off; companion still gets frames while live.
        if !PREVIEW_ENABLED.load(Ordering::Acquire) && !companion_live {
            continue;
        }
        // Gate on editable focus (same signal as Focus mode auto-show, #200).
        // Applies to the companion tablet too: no text field focused → cleared.
        match next_preview_action(
            has_input_target() && is_input_focused(),
            get_input_target_bounds(),
        ) {
            PreviewFrameAction::Clear => {
                wgc_capture::close_session();
                last_frame = reset_last_frame(FrameSkipReset::Cleared);
                route_cleared(companion_live);
            }
            PreviewFrameAction::KeepLastFrame => {
                // Transient UIA/bounds miss while the target HWND remains — do not flicker.
            }
            PreviewFrameAction::Capture(bounds) => {
                let hwnd = get_effective_input_hwnd()
                    .map(|h| h.0 as isize)
                    .unwrap_or(0);
                if last_frame.is_some_and(|k| k.target_hwnd != hwnd) {
                    last_frame = reset_last_frame(FrameSkipReset::TargetChanged);
                }
                match capture_and_maybe_encode(&bounds, last_frame) {
                    Ok(CaptureOutcome::Skipped) => {}
                    Ok(CaptureOutcome::Encoded {
                        jpeg,
                        width,
                        height,
                        key,
                    }) => {
                        last_frame = Some(key);
                        if companion_live {
                            // Companion/Android still expects a data URL; build only on this path.
                            let b64 = STANDARD.encode(&jpeg);
                            let data_url = format!("data:image/jpeg;base64,{b64}");
                            push_frame_to_companion(data_url, width, height);
                        } else {
                            send_frame_to_desktop(jpeg, width, height);
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
    // Also nudge the channel with a zero-length message when a subscriber is live.
    send_raw_to_desktop(Vec::new());
}

fn send_frame_to_desktop(jpeg: Vec<u8>, width: u32, height: u32) {
    send_raw_to_desktop(encode_preview_frame_bytes(&jpeg, width, height));
}

fn send_raw_to_desktop(bytes: Vec<u8>) {
    let mut guard = PREVIEW_CHANNEL
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let Some(channel) = guard.as_ref() else {
        return;
    };
    if channel.send(InvokeResponseBody::Raw(bytes)).is_err() {
        // Webview gone / channel closed — drop so the next subscribe can replace it.
        *guard = None;
    }
}

enum CaptureOutcome {
    Skipped,
    Encoded {
        jpeg: Vec<u8>,
        width: u32,
        height: u32,
        key: FrameSkipKey,
    },
}

fn log_capture_path(path: &'static str) {
    let mut guard = LAST_CAPTURE_PATH
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if *guard == Some(path) {
        return;
    }
    *guard = Some(path);
    eprintln!("input preview capture path: {path}");
}

/// Capture BGRA, skip JPEG/base64 when unchanged; otherwise encode.
///
/// Order: Windows.Graphics.Capture field strip → PrintWindow crop → desktop BitBlt.
fn capture_and_maybe_encode(
    bounds: &ScreenRect,
    last: Option<FrameSkipKey>,
) -> Result<CaptureOutcome, String> {
    let rect = padded_clamped_rect(bounds);
    if rect.width <= 0 || rect.height <= 0 {
        return Err("empty capture rect".into());
    }

    let (src_w, src_h) = (rect.width, rect.height);
    let target_hwnd = get_effective_input_hwnd()
        .map(|hwnd| hwnd.0 as isize)
        .unwrap_or(0);

    let bgra = match get_effective_input_hwnd() {
        Some(hwnd) => match wgc_capture::try_capture_strip(hwnd, &rect) {
            Ok(StripCapture::Ready(pixels)) => {
                log_capture_path("wgc");
                pixels
            }
            Ok(StripCapture::NotReady) => {
                // Session just started; keep the last frame instead of flickering via GDI.
                return Ok(CaptureOutcome::Skipped);
            }
            Err(wgc_err) => match capture_window_region_bgra(hwnd, &rect) {
                Ok(pixels) => {
                    log_capture_path("printwindow");
                    pixels
                }
                Err(pw_err) => {
                    eprintln!(
                        "input preview window capture failed (wgc: {wgc_err}; printwindow: {pw_err}); falling back to screen"
                    );
                    let pixels = capture_screen_bgra(rect.left, rect.top, src_w, src_h)?;
                    log_capture_path("bitblt");
                    pixels
                }
            },
        },
        None => {
            let pixels = capture_screen_bgra(rect.left, rect.top, src_w, src_h)?;
            log_capture_path("bitblt");
            pixels
        }
    };

    let key = frame_skip_key(
        target_hwnd,
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        &bgra,
    );
    match decide_frame_emit(last, key) {
        FrameEmitDecision::Skip => Ok(CaptureOutcome::Skipped),
        FrameEmitDecision::Emit(key) => {
            let (jpeg, width, height) = encode_bgra_jpeg(&bgra, src_w, src_h)?;
            Ok(CaptureOutcome::Encoded {
                jpeg,
                width,
                height,
                key,
            })
        }
    }
}

fn encode_bgra_jpeg(bgra: &[u8], src_w: i32, src_h: i32) -> Result<(Vec<u8>, u32, u32), String> {
    let (dest_w, dest_h) = scale_to_max(src_w, src_h, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT);

    // Downscale on BGRA first so conversion/encode see fewer pixels.
    // Box average handles any downscale ratio (buckets of 1..n px), so thin
    // text strokes are averaged rather than dropped as with nearest-neighbour.
    let (work, w, h) = if dest_w == src_w && dest_h == src_h {
        (None, src_w as u32, src_h as u32)
    } else {
        let resized =
            resize_bgra_box(bgra, src_w as u32, src_h as u32, dest_w as u32, dest_h as u32)?;
        (Some(resized), dest_w as u32, dest_h as u32)
    };
    let pixels = work.as_deref().unwrap_or(bgra);
    let img = bgra_to_rgb(pixels, w, h)?;

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

/// Integer box average of BGRA pixels into `dest_w`×`dest_h` (any downscale ratio).
fn resize_bgra_box(
    src: &[u8],
    src_w: u32,
    src_h: u32,
    dest_w: u32,
    dest_h: u32,
) -> Result<Vec<u8>, String> {
    let expected = (src_w as usize)
        .saturating_mul(src_h as usize)
        .saturating_mul(4);
    if src.len() < expected {
        return Err(format!(
            "BGRA buffer too short for box resize: {} < {}",
            src.len(),
            expected
        ));
    }
    if dest_w == 0 || dest_h == 0 {
        return Err("empty box resize destination".into());
    }

    let mut out = vec![0u8; (dest_w as usize) * (dest_h as usize) * 4];
    for dy in 0..dest_h {
        let y0 = (dy as u64 * src_h as u64 / dest_h as u64) as u32;
        let y1 = (((dy as u64 + 1) * src_h as u64) / dest_h as u64) as u32;
        let y1 = y1.max(y0 + 1).min(src_h);
        for dx in 0..dest_w {
            let x0 = (dx as u64 * src_w as u64 / dest_w as u64) as u32;
            let x1 = (((dx as u64 + 1) * src_w as u64) / dest_w as u64) as u32;
            let x1 = x1.max(x0 + 1).min(src_w);

            let mut b_sum = 0u32;
            let mut g_sum = 0u32;
            let mut r_sum = 0u32;
            let mut a_sum = 0u32;
            let mut n = 0u32;
            for y in y0..y1 {
                let row = (y as usize) * (src_w as usize) * 4;
                for x in x0..x1 {
                    let i = row + (x as usize) * 4;
                    b_sum += src[i] as u32;
                    g_sum += src[i + 1] as u32;
                    r_sum += src[i + 2] as u32;
                    a_sum += src[i + 3] as u32;
                    n += 1;
                }
            }
            let o = ((dy as usize) * (dest_w as usize) + (dx as usize)) * 4;
            out[o] = (b_sum / n) as u8;
            out[o + 1] = (g_sum / n) as u8;
            out[o + 2] = (r_sum / n) as u8;
            out[o + 3] = (a_sum / n) as u8;
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CaptureRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

/// Map a screen-space strip into coordinates relative to a window's screen rect, clipped.
pub(crate) fn window_local_capture_rect(
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
pub(crate) fn crop_bgra(src: &[u8], src_w: i32, src_h: i32, crop: CaptureRect) -> Option<Vec<u8>> {
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
    let expected = (src_w as usize)
        .saturating_mul(src_h as usize)
        .saturating_mul(4);
    if src.len() < expected {
        return None;
    }
    let mut out = vec![0u8; (crop.width as usize).saturating_mul(crop.height as usize) * 4];
    for row in 0..crop.height as usize {
        let src_off = ((crop.top as usize + row) * src_w as usize + crop.left as usize) * 4;
        let dst_off = row * crop.width as usize * 4;
        let len = crop.width as usize * 4;
        out[dst_off..dst_off + len].copy_from_slice(&src[src_off..src_off + len]);
    }
    Some(out)
}

/// Pad a field rect and clamp it to a virtual-screen rectangle (pure; unit-tested).
pub(crate) fn clamp_padded_rect(
    bounds: &ScreenRect,
    padding: i32,
    vx: i32,
    vy: i32,
    vw: i32,
    vh: i32,
) -> CaptureRect {
    let mut left = bounds.left.saturating_sub(padding);
    let mut top = bounds.top.saturating_sub(padding);
    let mut right = bounds
        .left
        .saturating_add(bounds.width)
        .saturating_add(padding);
    let mut bottom = bounds
        .top
        .saturating_add(bounds.height)
        .saturating_add(padding);

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

fn padded_clamped_rect(bounds: &ScreenRect) -> CaptureRect {
    let vx = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let vy = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let vw = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let vh = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };
    clamp_padded_rect(bounds, PADDING, vx, vy, vw, vh)
}

/// Destination offset of a clipped local crop inside the requested screen strip.
pub(crate) fn letterbox_dst_offset(
    screen: CaptureRect,
    window_left: i32,
    window_top: i32,
    local: CaptureRect,
) -> (i32, i32) {
    let dst_x = (local.left - (screen.left - window_left)).max(0);
    let dst_y = (local.top - (screen.top - window_top)).max(0);
    (dst_x, dst_y)
}

/// Place a clipped BGRA crop into a full requested strip (black letterbox elsewhere).
pub(crate) fn letterbox_bgra(
    cropped: &[u8],
    local: CaptureRect,
    screen: CaptureRect,
    dst_x: i32,
    dst_y: i32,
) -> Vec<u8> {
    let mut out = vec![0u8; (screen.width as usize).saturating_mul(screen.height as usize) * 4];
    let dst_x = dst_x.max(0) as usize;
    let dst_y = dst_y.max(0) as usize;
    for row in 0..local.height as usize {
        let src_off = row.saturating_mul(local.width as usize).saturating_mul(4);
        let dst_off = (dst_y.saturating_add(row))
            .saturating_mul(screen.width as usize)
            .saturating_add(dst_x)
            .saturating_mul(4);
        let len = (local.width as usize).saturating_mul(4);
        if dst_off.saturating_add(len) <= out.len() && src_off.saturating_add(len) <= cropped.len()
        {
            out[dst_off..dst_off + len].copy_from_slice(&cropped[src_off..src_off + len]);
        }
    }
    out
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
                biCompression: BI_RGB.0,
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

        let (dst_x, dst_y) =
            letterbox_dst_offset(*screen_rect, window_rect.left, window_rect.top, local);
        Ok(letterbox_bgra(&cropped, local, *screen_rect, dst_x, dst_y))
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
                biCompression: BI_RGB.0,
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

/// Convert packed BGRA8 to an `RgbImage` via a single slice pass (no `put_pixel`).
fn bgra_to_rgb(bgra: &[u8], width: u32, height: u32) -> Result<RgbImage, String> {
    let expected = (width as usize)
        .saturating_mul(height as usize)
        .saturating_mul(4);
    if bgra.len() < expected {
        return Err(format!(
            "BGRA buffer too short: {} < {}",
            bgra.len(),
            expected
        ));
    }
    let pixel_count = (width as usize).saturating_mul(height as usize);
    let mut buf = Vec::with_capacity(pixel_count.saturating_mul(3));
    for px in bgra[..expected].chunks_exact(4) {
        buf.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    RgbImage::from_raw(width, height, buf)
        .ok_or_else(|| "RgbImage::from_raw rejected buffer".into())
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

/// Identity of a captured strip used to skip unchanged JPEG encode/emit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FrameSkipKey {
    target_hwnd: isize,
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    pixel_hash: u64,
}

/// Whether to encode/emit after a capture, given the last sent key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FrameEmitDecision {
    Skip,
    Emit(FrameSkipKey),
}

/// Fast non-crypto hash of raw BGRA pixels plus dimensions (bounds folded in by caller).
pub(crate) fn hash_frame_pixels(bgra: &[u8], width: i32, height: i32) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    width.hash(&mut hasher);
    height.hash(&mut hasher);
    bgra.hash(&mut hasher);
    hasher.finish()
}

/// Build a skip key from target, screen bounds, and pixel buffer.
pub(crate) fn frame_skip_key(
    target_hwnd: isize,
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    bgra: &[u8],
) -> FrameSkipKey {
    FrameSkipKey {
        target_hwnd,
        left,
        top,
        width,
        height,
        pixel_hash: hash_frame_pixels(bgra, width, height),
    }
}

/// Skip encode/emit when this capture matches the last sent frame for the same target.
pub(crate) fn decide_frame_emit(
    last: Option<FrameSkipKey>,
    current: FrameSkipKey,
) -> FrameEmitDecision {
    if last == Some(current) {
        FrameEmitDecision::Skip
    } else {
        FrameEmitDecision::Emit(current)
    }
}

/// Events that must clear the last-sent key so the next capture always emits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FrameSkipReset {
    Cleared,
    TargetChanged,
    EnabledChanged,
    CompanionConnected,
    CompanionDisconnected,
    AnimationEnded,
}

/// Pure companion-routing transition: `(reset_last_frame, clear_desktop_strip)`.
pub(crate) fn companion_transition(was_live: bool, now_live: bool) -> (bool, bool) {
    if was_live == now_live {
        return (false, false);
    }
    // Connect: reset + clear desktop. Disconnect: reset only (keep capturing for desktop).
    (true, now_live)
}

/// After a reset event, forget the last frame (fresh emit required).
pub(crate) fn reset_last_frame(_event: FrameSkipReset) -> Option<FrameSkipKey> {
    None
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
    fn clamp_padded_rect_clips_to_virtual_screen() {
        let bounds = ScreenRect {
            left: -20,
            top: -10,
            width: 100,
            height: 50,
        };
        // Virtual screen at (-100,-50) size 200×100; padding 4.
        let rect = clamp_padded_rect(&bounds, 4, -100, -50, 200, 100);
        assert_eq!(rect.left, -24);
        assert_eq!(rect.top, -14);
        assert_eq!(rect.width, 108);
        assert_eq!(rect.height, 58);

        // Fully off the right/bottom edge → empty.
        let empty = clamp_padded_rect(
            &ScreenRect {
                left: 500,
                top: 500,
                width: 40,
                height: 20,
            },
            0,
            0,
            0,
            100,
            100,
        );
        assert_eq!(empty.width, 0);
        assert_eq!(empty.height, 0);
    }

    #[test]
    fn letterbox_dst_offset_places_clipped_crop() {
        // Screen strip overhangs left of window: local.left=0, screen relative x=-10 → dst 10.
        let screen = CaptureRect {
            left: 90,
            top: 200,
            width: 100,
            height: 40,
        };
        let local = CaptureRect {
            left: 0,
            top: 0,
            width: 90,
            height: 40,
        };
        let (dx, dy) = letterbox_dst_offset(screen, 100, 200, local);
        assert_eq!((dx, dy), (10, 0));
    }

    #[test]
    fn letterbox_bgra_pads_clipped_rows() {
        let local = CaptureRect {
            left: 0,
            top: 0,
            width: 2,
            height: 1,
        };
        let screen = CaptureRect {
            left: 0,
            top: 0,
            width: 4,
            height: 1,
        };
        // Two BGRA pixels: B=1 and B=2.
        let cropped = vec![1, 0, 0, 255, 2, 0, 0, 255];
        let out = letterbox_bgra(&cropped, local, screen, 1, 0);
        assert_eq!(out.len(), 16);
        assert_eq!(&out[0..4], &[0, 0, 0, 0]); // letterbox left
        assert_eq!(&out[4..8], &[1, 0, 0, 255]);
        assert_eq!(&out[8..12], &[2, 0, 0, 255]);
        assert_eq!(&out[12..16], &[0, 0, 0, 0]); // letterbox right
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
        assert_eq!(out.len(), 8);
        assert_eq!(out[0], 1);
        assert_eq!(out[4], 2);
    }

    fn sample_bgra(fill: u8) -> Vec<u8> {
        vec![fill; 4 * 2 * 4]
    }

    #[test]
    fn hash_frame_pixels_stable_for_identical_buffer() {
        let a = sample_bgra(10);
        let b = sample_bgra(10);
        assert_eq!(hash_frame_pixels(&a, 4, 2), hash_frame_pixels(&b, 4, 2));
    }

    #[test]
    fn hash_frame_pixels_differs_when_pixels_change() {
        let a = sample_bgra(10);
        let b = sample_bgra(11);
        assert_ne!(hash_frame_pixels(&a, 4, 2), hash_frame_pixels(&b, 4, 2));
    }

    #[test]
    fn hash_frame_pixels_differs_when_dimensions_change() {
        let pixels = sample_bgra(10);
        assert_ne!(hash_frame_pixels(&pixels, 4, 2), hash_frame_pixels(&pixels, 2, 4));
    }

    #[test]
    fn decide_frame_emit_skips_unchanged_frame() {
        let key = frame_skip_key(42, 1, 2, 4, 2, &sample_bgra(7));
        assert_eq!(
            decide_frame_emit(Some(key), key),
            FrameEmitDecision::Skip
        );
    }

    #[test]
    fn decide_frame_emit_emits_first_frame() {
        let key = frame_skip_key(42, 1, 2, 4, 2, &sample_bgra(7));
        assert_eq!(
            decide_frame_emit(None, key),
            FrameEmitDecision::Emit(key)
        );
    }

    #[test]
    fn decide_frame_emit_emits_when_pixels_change() {
        let last = frame_skip_key(42, 1, 2, 4, 2, &sample_bgra(7));
        let next = frame_skip_key(42, 1, 2, 4, 2, &sample_bgra(8));
        assert_eq!(
            decide_frame_emit(Some(last), next),
            FrameEmitDecision::Emit(next)
        );
    }

    #[test]
    fn decide_frame_emit_emits_when_target_changes() {
        let pixels = sample_bgra(7);
        let last = frame_skip_key(42, 1, 2, 4, 2, &pixels);
        let next = frame_skip_key(99, 1, 2, 4, 2, &pixels);
        assert_eq!(
            decide_frame_emit(Some(last), next),
            FrameEmitDecision::Emit(next)
        );
    }

    #[test]
    fn decide_frame_emit_emits_when_bounds_change() {
        let pixels = sample_bgra(7);
        let last = frame_skip_key(42, 1, 2, 4, 2, &pixels);
        let next = frame_skip_key(42, 10, 2, 4, 2, &pixels);
        assert_eq!(
            decide_frame_emit(Some(last), next),
            FrameEmitDecision::Emit(next)
        );
    }

    #[test]
    fn reset_last_frame_clears_for_all_reset_events() {
        let events = [
            FrameSkipReset::Cleared,
            FrameSkipReset::TargetChanged,
            FrameSkipReset::EnabledChanged,
            FrameSkipReset::CompanionConnected,
            FrameSkipReset::CompanionDisconnected,
            FrameSkipReset::AnimationEnded,
        ];
        for event in events {
            assert_eq!(reset_last_frame(event), None);
        }
    }

    #[test]
    fn companion_transition_connect_resets_and_clears_desktop() {
        assert_eq!(companion_transition(false, true), (true, true));
    }

    #[test]
    fn companion_transition_disconnect_resets_without_clearing_desktop() {
        assert_eq!(companion_transition(true, false), (true, false));
    }

    #[test]
    fn companion_transition_steady_states_are_noops() {
        assert_eq!(companion_transition(false, false), (false, false));
        assert_eq!(companion_transition(true, true), (false, false));
    }

    #[test]
    fn animation_pause_counter_nests_and_clears() {
        // Reset in case other tests left a count (tests share the process static).
        while animation_paused() {
            end_animation_pause();
        }
        begin_animation_pause();
        begin_animation_pause();
        end_animation_pause();
        assert!(animation_paused());
        end_animation_pause();
        assert!(!animation_paused());
        // Extra end is a no-op (no underflow).
        end_animation_pause();
        assert!(!animation_paused());
    }

    fn make_gradient_bgra(w: u32, h: u32) -> Vec<u8> {
        let mut buf = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let i = ((y * w + x) * 4) as usize;
                buf[i] = (x % 256) as u8; // B
                buf[i + 1] = (y % 256) as u8; // G
                buf[i + 2] = ((x + y) % 256) as u8; // R
                buf[i + 3] = 255;
            }
        }
        buf
    }

    /// Old put_pixel conversion kept only as the identity oracle for the slice rewrite.
    #[cfg(test)]
    fn bgra_to_rgb_reference(bgra: &[u8], width: u32, height: u32) -> RgbImage {
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

    #[test]
    fn bgra_to_rgb_matches_reference_on_edge_and_random_sizes() {
        let cases: &[(u32, u32)] = &[(1, 1), (3, 5), (640, 120), (1200, 400)];
        for &(w, h) in cases {
            let bgra = make_gradient_bgra(w, h);
            let expected = bgra_to_rgb_reference(&bgra, w, h);
            let actual = bgra_to_rgb(&bgra, w, h).expect("convert");
            assert_eq!(
                actual.as_raw(),
                expected.as_raw(),
                "RGB mismatch for {w}x{h}"
            );
        }

        // Pseudo-random buffer (deterministic LCG) at odd width.
        let (w, h) = (17u32, 9u32);
        let mut bgra = vec![0u8; (w * h * 4) as usize];
        let mut state = 0xC0FFEE_u32;
        for byte in &mut bgra {
            state = state.wrapping_mul(1664525).wrapping_add(1013904223);
            *byte = (state >> 24) as u8;
        }
        let expected = bgra_to_rgb_reference(&bgra, w, h);
        let actual = bgra_to_rgb(&bgra, w, h).expect("convert");
        assert_eq!(actual.as_raw(), expected.as_raw());
    }

    #[test]
    fn bgra_to_rgb_rejects_short_buffer() {
        let bgra = vec![0u8; 3]; // not enough for 1x1
        assert!(bgra_to_rgb(&bgra, 1, 1).is_err());
    }

    #[test]
    fn resize_bgra_box_averages_each_bucket() {
        // 4x2 -> 2x1: each dest pixel is the mean of one 2x2 block.
        let src: Vec<u8> = vec![
            0, 0, 0, 255, 100, 100, 100, 255, 10, 20, 30, 255, 10, 20, 30, 255,
            200, 200, 200, 255, 100, 100, 100, 255, 30, 40, 50, 255, 30, 40, 50, 255,
        ];
        let out = resize_bgra_box(&src, 4, 2, 2, 1).expect("box");
        assert_eq!(out, vec![100, 100, 100, 255, 20, 30, 40, 255]);
    }

    #[test]
    fn resize_bgra_box_keeps_uniform_color_at_fractional_ratio() {
        let (sw, sh, dw, dh) = (1000u32, 150u32, 640u32, 96u32);
        let src: Vec<u8> = [12u8, 34, 56, 255].repeat((sw * sh) as usize);
        let out = resize_bgra_box(&src, sw, sh, dw, dh).expect("box");
        assert_eq!(out.len(), (dw * dh * 4) as usize);
        assert!(out.chunks_exact(4).all(|p| p == [12, 34, 56, 255]));
    }

    #[test]
    fn resize_bgra_box_rejects_short_buffer() {
        let src = vec![0u8; 4 * 4 * 4 - 1];
        assert!(resize_bgra_box(&src, 4, 4, 2, 2).is_err());
    }

    #[test]
    fn encode_preview_frame_bytes_le_header_then_jpeg() {
        let jpeg = [0xffu8, 0xd8, 0xff, 0xd9];
        let packed = encode_preview_frame_bytes(&jpeg, 640, 120);
        assert_eq!(packed.len(), 12);
        assert_eq!(&packed[0..4], &640u32.to_le_bytes());
        assert_eq!(&packed[4..8], &120u32.to_le_bytes());
        assert_eq!(&packed[8..], &jpeg);
    }

    #[test]
    fn encode_bgra_jpeg_output_dims_match_scale_to_max() {
        let cases: &[(i32, i32)] = &[
            (640, 120),
            (320, 60),
            (1280, 200),
            (1200, 400),
            (800, 100),
            (100, 200),
        ];
        for &(src_w, src_h) in cases {
            let bgra = make_gradient_bgra(src_w as u32, src_h as u32);
            let (jpeg, out_w, out_h) = encode_bgra_jpeg(&bgra, src_w, src_h).expect("encode");
            let (expect_w, expect_h) =
                scale_to_max(src_w, src_h, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT);
            assert_eq!(out_w, expect_w as u32, "width for {src_w}x{src_h}");
            assert_eq!(out_h, expect_h as u32, "height for {src_w}x{src_h}");
            assert!(!jpeg.is_empty());
        }
    }

    /// Release microbench for PR timings. Run with:
    /// `cargo test -p reach-panel --release --locked bench_encode_stages_release -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn bench_encode_stages_release() {
        use std::time::Instant;

        fn avg_ms(total_ns: u128, iters: u32) -> f64 {
            (total_ns as f64 / iters as f64) / 1e6
        }

        fn time_old(label: &str, w: i32, h: i32, iters: u32) {
            let bgra = make_gradient_bgra(w as u32, h as u32);
            let (dest_w, dest_h) = scale_to_max(w, h, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT);
            let needs_resize = dest_w != w || dest_h != h;
            let _ = bgra_to_rgb_reference(&bgra, w as u32, h as u32);

            let mut convert_ns = 0u128;
            let mut resize_ns = 0u128;
            let mut encode_ns = 0u128;

            for _ in 0..iters {
                let tc = Instant::now();
                let rgb = bgra_to_rgb_reference(&bgra, w as u32, h as u32);
                convert_ns += tc.elapsed().as_nanos();

                let img = if needs_resize {
                    let tr = Instant::now();
                    let resized = image::imageops::resize(
                        &rgb,
                        dest_w as u32,
                        dest_h as u32,
                        image::imageops::FilterType::Triangle,
                    );
                    resize_ns += tr.elapsed().as_nanos();
                    resized
                } else {
                    rgb
                };

                let te = Instant::now();
                let mut jpeg = Vec::new();
                let encoder = JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY);
                encoder
                    .write_image(
                        img.as_raw(),
                        img.width(),
                        img.height(),
                        ExtendedColorType::Rgb8,
                    )
                    .expect("jpeg");
                encode_ns += te.elapsed().as_nanos();
            }

            eprintln!(
                "BEFORE {label}: convert={:.3}ms resize={:.3}ms encode={:.3}ms (avg over {iters}, dest {}x{})",
                avg_ms(convert_ns, iters),
                avg_ms(resize_ns, iters),
                avg_ms(encode_ns, iters),
                dest_w,
                dest_h,
            );
        }

        fn time_new(label: &str, w: i32, h: i32, iters: u32) {
            let bgra = make_gradient_bgra(w as u32, h as u32);
            let (dest_w, dest_h) = scale_to_max(w, h, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT);
            let needs_resize = dest_w != w || dest_h != h;
            let _ = encode_bgra_jpeg(&bgra, w, h);

            let mut convert_ns = 0u128;
            let mut resize_ns = 0u128;
            let mut encode_ns = 0u128;

            for _ in 0..iters {
                let (work, ww, hh) = if needs_resize {
                    let tr = Instant::now();
                    let resized =
                        resize_bgra_box(&bgra, w as u32, h as u32, dest_w as u32, dest_h as u32)
                            .expect("box");
                    resize_ns += tr.elapsed().as_nanos();
                    (resized, dest_w as u32, dest_h as u32)
                } else {
                    (bgra.clone(), w as u32, h as u32)
                };

                let tc = Instant::now();
                let rgb = bgra_to_rgb(&work, ww, hh).expect("rgb");
                convert_ns += tc.elapsed().as_nanos();

                let te = Instant::now();
                let mut jpeg = Vec::new();
                let encoder = JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY);
                encoder
                    .write_image(
                        rgb.as_raw(),
                        rgb.width(),
                        rgb.height(),
                        ExtendedColorType::Rgb8,
                    )
                    .expect("jpeg");
                encode_ns += te.elapsed().as_nanos();
            }

            eprintln!(
                "AFTER  {label}: convert={:.3}ms resize={:.3}ms encode={:.3}ms (avg over {iters}, dest {}x{})",
                avg_ms(convert_ns, iters),
                avg_ms(resize_ns, iters),
                avg_ms(encode_ns, iters),
                dest_w,
                dest_h,
            );
        }

        time_old("640x120", 640, 120, 80);
        time_new("640x120", 640, 120, 80);
        time_old("1200x400", 1200, 400, 40);
        time_new("1200x400", 1200, 400, 40);
    }

    /// Writes before/after JPEG samples for visual parity notes (synthetic gradient + stripes).
    #[test]
    #[ignore]
    fn write_visual_parity_samples() {
        use std::fs;
        use std::path::PathBuf;

        fn encode_old(bgra: &[u8], w: i32, h: i32) -> Vec<u8> {
            let (dest_w, dest_h) = scale_to_max(w, h, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT);
            let rgb = bgra_to_rgb_reference(bgra, w as u32, h as u32);
            let img = if dest_w == w && dest_h == h {
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
                .expect("jpeg");
            jpeg
        }

        fn striped_textish(w: u32, h: u32) -> Vec<u8> {
            let mut buf = vec![255u8; (w * h * 4) as usize];
            // Dark horizontal "text lines" every 8px to mimic field content.
            for y in 0..h {
                let on_line = (y % 8) < 2;
                for x in 0..w {
                    let i = ((y * w + x) * 4) as usize;
                    if on_line && (x / 4) % 3 != 0 {
                        buf[i] = 40;
                        buf[i + 1] = 40;
                        buf[i + 2] = 40;
                    }
                    buf[i + 3] = 255;
                }
            }
            buf
        }

        let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("docs")
            .join("perf")
            .join("issue-313-visual");
        fs::create_dir_all(&out_dir).expect("mkdir");

        for &(w, h, name) in &[
            (640i32, 120i32, "640x120"),
            (1200i32, 400i32, "1200x400"),
        ] {
            let bgra = striped_textish(w as u32, h as u32);
            let before = encode_old(&bgra, w, h);
            let (after, _, _) = encode_bgra_jpeg(&bgra, w, h).expect("new");
            fs::write(out_dir.join(format!("{name}-before.jpg")), &before).expect("write before");
            fs::write(out_dir.join(format!("{name}-after.jpg")), &after).expect("write after");
        }
        eprintln!("wrote samples to {}", out_dir.display());
    }
}
