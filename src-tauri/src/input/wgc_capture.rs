//! Windows.Graphics.Capture path that copies only the focused field strip to the CPU.
//!
//! Primary input-preview capture backend (#312). Falls back to PrintWindow/BitBlt in
//! `input_preview` when WGC is unsupported or fails.

use std::sync::Mutex;

use windows::core::{Interface, HSTRING};
use windows::Foundation::Metadata::ApiInformation;
use windows::Graphics::Capture::{
    Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_BOX, D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
#[cfg(test)]
use windows::Win32::Graphics::Dxgi::{DXGI_ERROR_DEVICE_REMOVED, DXGI_ERROR_DEVICE_RESET};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

use super::input_preview::{
    letterbox_bgra, letterbox_dst_offset, window_local_capture_rect, CaptureRect,
};

/// Result of a WGC strip attempt.
pub(crate) enum StripCapture {
    /// Tight BGRA buffer matching the requested screen strip size.
    Ready(Vec<u8>),
    /// Session exists but no frame yet — caller should keep the last frame (no GDI fallback).
    NotReady,
}

struct D3dState {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    winrt_device: IDirect3DDevice,
}

struct SessionState {
    hwnd: isize,
    content_w: i32,
    content_h: i32,
    item: GraphicsCaptureItem,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    staging: Option<StagingStrip>,
}

struct StagingStrip {
    texture: ID3D11Texture2D,
    width: u32,
    height: u32,
}

struct Runtime {
    d3d: Option<D3dState>,
    session: Option<SessionState>,
    /// After one successful device rebuild, further device-lost errors fall through to GDI.
    device_rebuilt_once: bool,
    /// Set by `note_bounds_changed`; forces content-size refresh on next capture.
    bounds_dirty: bool,
}

// Free-threaded frame pool + MTA COM: handles are shared across the preview worker and
// UI-thread close/bounds notifications. windows-rs WinRT types are !Send/!Sync by default.
unsafe impl Send for Runtime {}
unsafe impl Sync for Runtime {}

static RUNTIME: Mutex<Runtime> = Mutex::new(Runtime {
    d3d: None,
    session: None,
    device_rebuilt_once: false,
    bounds_dirty: false,
});

fn ensure_com() {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

#[cfg(test)]
fn is_device_lost(err: &windows::core::Error) -> bool {
    let code = err.code();
    code == DXGI_ERROR_DEVICE_REMOVED || code == DXGI_ERROR_DEVICE_RESET
}

fn property_present(type_name: &str, property: &str) -> bool {
    ApiInformation::IsPropertyPresent(&HSTRING::from(type_name), &HSTRING::from(property))
        .unwrap_or(false)
}

fn wgc_supported() -> bool {
    ensure_com();
    GraphicsCaptureSession::IsSupported().unwrap_or(false)
}

fn create_d3d() -> Result<D3dState, String> {
    unsafe {
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        let feature_levels = [D3D_FEATURE_LEVEL_11_0];
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&feature_levels),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .map_err(|e| format!("D3D11CreateDevice: {e}"))?;
        let device = device.ok_or_else(|| "D3D11CreateDevice returned no device".to_string())?;
        let context = context.ok_or_else(|| "D3D11CreateDevice returned no context".to_string())?;

        let dxgi: IDXGIDevice = device
            .cast()
            .map_err(|e| format!("IDXGIDevice cast: {e}"))?;
        let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi)
            .map_err(|e| format!("CreateDirect3D11DeviceFromDXGIDevice: {e}"))?;
        let winrt_device: IDirect3DDevice = inspectable
            .cast()
            .map_err(|e| format!("IDirect3DDevice cast: {e}"))?;

        Ok(D3dState {
            device,
            context,
            winrt_device,
        })
    }
}

fn extended_frame_bounds(hwnd: HWND) -> Result<RECT, String> {
    unsafe {
        let mut rect = RECT::default();
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut _ as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .map_err(|e| format!("DwmGetWindowAttribute: {e}"))?;
        Ok(rect)
    }
}

fn configure_session(session: &GraphicsCaptureSession) -> Result<(), String> {
    if property_present(
        "Windows.Graphics.Capture.GraphicsCaptureSession",
        "IsCursorCaptureEnabled",
    ) {
        session
            .SetIsCursorCaptureEnabled(false)
            .map_err(|e| format!("SetIsCursorCaptureEnabled: {e}"))?;
    }
    if property_present(
        "Windows.Graphics.Capture.GraphicsCaptureSession",
        "IsBorderRequired",
    ) {
        session
            .SetIsBorderRequired(false)
            .map_err(|e| format!("SetIsBorderRequired: {e}"))?;
    }
    Ok(())
}

fn create_session(d3d: &D3dState, hwnd: HWND) -> Result<SessionState, String> {
    unsafe {
        let interop: IGraphicsCaptureItemInterop =
            windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                .map_err(|e| format!("GraphicsCaptureItem factory: {e}"))?;
        let item: GraphicsCaptureItem = interop
            .CreateForWindow(hwnd)
            .map_err(|e| format!("CreateForWindow: {e}"))?;
        let size = item.Size().map_err(|e| format!("item.Size: {e}"))?;
        if size.Width <= 0 || size.Height <= 0 {
            return Err("capture item has empty ContentSize".into());
        }

        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &d3d.winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            size,
        )
        .map_err(|e| format!("CreateFreeThreaded: {e}"))?;
        let session = pool
            .CreateCaptureSession(&item)
            .map_err(|e| format!("CreateCaptureSession: {e}"))?;
        configure_session(&session)?;
        session
            .StartCapture()
            .map_err(|e| format!("StartCapture: {e}"))?;

        Ok(SessionState {
            hwnd: hwnd.0 as isize,
            content_w: size.Width,
            content_h: size.Height,
            item,
            pool,
            session,
            staging: None,
        })
    }
}

fn close_session_inner(rt: &mut Runtime) {
    if let Some(session) = rt.session.take() {
        let _ = session.session.Close();
        let _ = session.pool.Close();
    }
}

/// Tear down the active capture session (focus clear, preview disable, app idle).
pub(crate) fn close_session() {
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    close_session_inner(&mut rt);
}

/// Mark that field bounds changed; next capture refreshes content size if needed.
pub(crate) fn note_bounds_changed() {
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    rt.bounds_dirty = true;
}

fn ensure_d3d(rt: &mut Runtime) -> Result<(), String> {
    if rt.d3d.is_none() {
        rt.d3d = Some(create_d3d()?);
    }
    Ok(())
}

fn ensure_session_for_hwnd(rt: &mut Runtime, hwnd: HWND) -> Result<(), String> {
    let hwnd_id = hwnd.0 as isize;
    let needs_new = match rt.session.as_ref() {
        None => true,
        Some(s) => s.hwnd != hwnd_id,
    };
    if !needs_new {
        return Ok(());
    }
    close_session_inner(rt);
    ensure_d3d(rt)?;
    let d3d = rt
        .d3d
        .as_ref()
        .ok_or_else(|| "D3D device missing".to_string())?;
    rt.session = Some(create_session(d3d, hwnd)?);
    Ok(())
}

fn recreate_pool_for_size(
    d3d: &D3dState,
    session: &mut SessionState,
    size: SizeInt32,
) -> Result<(), String> {
    session
        .pool
        .Recreate(
            &d3d.winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            size,
        )
        .map_err(|e| format!("FramePool.Recreate: {e}"))?;
    session.content_w = size.Width;
    session.content_h = size.Height;
    session.staging = None;
    Ok(())
}

fn ensure_staging(
    d3d: &D3dState,
    session: &mut SessionState,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let reuse = session
        .staging
        .as_ref()
        .is_some_and(|s| s.width == width && s.height == height);
    if reuse {
        return Ok(());
    }
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut texture: Option<ID3D11Texture2D> = None;
    unsafe {
        d3d.device
            .CreateTexture2D(&desc, None, Some(&mut texture))
            .map_err(|e| format!("CreateTexture2D(staging): {e}"))?;
    }
    let texture = texture.ok_or_else(|| "CreateTexture2D returned no staging".to_string())?;
    session.staging = Some(StagingStrip {
        texture,
        width,
        height,
    });
    Ok(())
}

fn copy_strip_from_texture(
    d3d: &D3dState,
    session: &mut SessionState,
    source: &ID3D11Texture2D,
    local: CaptureRect,
) -> Result<Vec<u8>, String> {
    let width = local.width as u32;
    let height = local.height as u32;
    ensure_staging(d3d, session, width, height)?;
    let staging = &session
        .staging
        .as_ref()
        .ok_or_else(|| "staging texture missing".to_string())?
        .texture;

    let region = D3D11_BOX {
        left: local.left as u32,
        top: local.top as u32,
        front: 0,
        right: (local.left + local.width) as u32,
        bottom: (local.top + local.height) as u32,
        back: 1,
    };

    unsafe {
        let staging_res: ID3D11Resource = staging
            .cast()
            .map_err(|e| format!("staging resource cast: {e}"))?;
        let source_res: ID3D11Resource = source
            .cast()
            .map_err(|e| format!("source resource cast: {e}"))?;
        d3d.context.CopySubresourceRegion(
            Some(&staging_res),
            0,
            0,
            0,
            0,
            Some(&source_res),
            0,
            Some(&region),
        );

        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        d3d.context
            .Map(
                Some(&staging_res),
                0,
                D3D11_MAP_READ,
                0,
                Some(&mut mapped),
            )
            .map_err(|e| format!("Map(staging): {e}"))?;

        let row_bytes = (width as usize).saturating_mul(4);
        let mut out = vec![0u8; row_bytes.saturating_mul(height as usize)];
        let src_ptr = mapped.pData as *const u8;
        if src_ptr.is_null() {
            d3d.context.Unmap(Some(&staging_res), 0);
            return Err("Map returned null pData".into());
        }
        for row in 0..height as usize {
            let src = std::slice::from_raw_parts(
                src_ptr.add(row.saturating_mul(mapped.RowPitch as usize)),
                row_bytes,
            );
            let dst_off = row.saturating_mul(row_bytes);
            out[dst_off..dst_off + row_bytes].copy_from_slice(src);
        }
        d3d.context.Unmap(Some(&staging_res), 0);
        Ok(out)
    }
}

fn drain_latest_frame(
    pool: &Direct3D11CaptureFramePool,
) -> Option<windows::Graphics::Capture::Direct3D11CaptureFrame> {
    let mut latest = None;
    while let Ok(frame) = pool.TryGetNextFrame() {
        latest = Some(frame);
    }
    latest
}

fn capture_once_inner(
    rt: &mut Runtime,
    hwnd: HWND,
    screen: &CaptureRect,
) -> Result<StripCapture, String> {
    if !wgc_supported() {
        return Err("GraphicsCaptureSession::IsSupported is false".into());
    }

    let frame_rect = extended_frame_bounds(hwnd)?;
    let frame_w = frame_rect.right.saturating_sub(frame_rect.left);
    let frame_h = frame_rect.bottom.saturating_sub(frame_rect.top);
    let local = window_local_capture_rect(
        *screen,
        frame_rect.left,
        frame_rect.top,
        frame_w,
        frame_h,
    )
    .ok_or_else(|| "capture rect does not intersect WGC frame bounds".to_string())?;

    ensure_session_for_hwnd(rt, hwnd)?;
    ensure_d3d(rt)?;

    let item_size = rt
        .session
        .as_ref()
        .ok_or_else(|| "WGC session missing".to_string())?
        .item
        .Size()
        .map_err(|e| format!("item.Size: {e}"))?;

    let size_changed = {
        let session = rt
            .session
            .as_ref()
            .ok_or_else(|| "WGC session missing".to_string())?;
        session.content_w != item_size.Width
            || session.content_h != item_size.Height
            || rt.bounds_dirty
    };
    if size_changed {
        rt.bounds_dirty = false;
        let d3d = rt
            .d3d
            .as_ref()
            .ok_or_else(|| "D3D device missing".to_string())?;
        let session = rt
            .session
            .as_mut()
            .ok_or_else(|| "WGC session missing".to_string())?;
        recreate_pool_for_size(d3d, session, item_size)?;
    }

    let frame = {
        let session = rt
            .session
            .as_ref()
            .ok_or_else(|| "WGC session missing".to_string())?;
        drain_latest_frame(&session.pool)
    };
    let Some(frame) = frame else {
        return Ok(StripCapture::NotReady);
    };

    let content = frame
        .ContentSize()
        .map_err(|e| format!("frame.ContentSize: {e}"))?;
    {
        let session = rt
            .session
            .as_ref()
            .ok_or_else(|| "WGC session missing".to_string())?;
        if content.Width != session.content_w || content.Height != session.content_h {
            let d3d = rt
                .d3d
                .as_ref()
                .ok_or_else(|| "D3D device missing".to_string())?;
            let session = rt
                .session
                .as_mut()
                .ok_or_else(|| "WGC session missing".to_string())?;
            recreate_pool_for_size(d3d, session, content)?;
            return Ok(StripCapture::NotReady);
        }
    }

    let surface = frame
        .Surface()
        .map_err(|e| format!("frame.Surface: {e}"))?;
    let access: IDirect3DDxgiInterfaceAccess = surface
        .cast()
        .map_err(|e| format!("IDirect3DDxgiInterfaceAccess: {e}"))?;
    let texture: ID3D11Texture2D = unsafe {
        access
            .GetInterface::<ID3D11Texture2D>()
            .map_err(|e| format!("GetInterface<ID3D11Texture2D>: {e}"))?
    };

    let mut tex_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe {
        texture.GetDesc(&mut tex_desc);
    }
    let tex_w = tex_desc.Width as i32;
    let tex_h = tex_desc.Height as i32;

    // Re-clamp the already-window-local crop against the actual texture dimensions.
    let local = CaptureRect {
        left: local.left.clamp(0, tex_w.saturating_sub(1).max(0)),
        top: local.top.clamp(0, tex_h.saturating_sub(1).max(0)),
        width: local.width.min(tex_w.saturating_sub(local.left)).max(0),
        height: local.height.min(tex_h.saturating_sub(local.top)).max(0),
    };
    if local.width <= 0 || local.height <= 0 {
        return Err("local crop empty after texture clamp".into());
    }

    let d3d = rt
        .d3d
        .as_ref()
        .ok_or_else(|| "D3D device missing".to_string())?;
    let session = rt
        .session
        .as_mut()
        .ok_or_else(|| "WGC session missing".to_string())?;
    let cropped = copy_strip_from_texture(d3d, session, &texture, local)?;

    if local.width == screen.width && local.height == screen.height {
        return Ok(StripCapture::Ready(cropped));
    }
    let (dst_x, dst_y) = letterbox_dst_offset(*screen, frame_rect.left, frame_rect.top, local);
    Ok(StripCapture::Ready(letterbox_bgra(
        &cropped, local, *screen, dst_x, dst_y,
    )))
}

fn rebuild_device_once(rt: &mut Runtime) -> Result<(), String> {
    close_session_inner(rt);
    rt.d3d = None;
    if rt.device_rebuilt_once {
        return Err("D3D device lost after rebuild".into());
    }
    rt.device_rebuilt_once = true;
    rt.d3d = Some(create_d3d()?);
    Ok(())
}

/// Capture the padded/clamped field strip for `hwnd` via WGC.
///
/// Returns [`StripCapture::NotReady`] when the session is up but no frame has arrived yet.
/// Returns `Err` when WGC cannot be used (caller should fall back to GDI).
pub(crate) fn try_capture_strip(
    hwnd: HWND,
    screen: &CaptureRect,
) -> Result<StripCapture, String> {
    if hwnd.0.is_null() {
        return Err("invalid hwnd".into());
    }
    if screen.width <= 0 || screen.height <= 0 {
        return Err("empty capture rect".into());
    }

    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());

    match capture_once_inner(&mut rt, hwnd, screen) {
        Ok(result) => {
            if matches!(result, StripCapture::Ready(_)) {
                rt.device_rebuilt_once = false;
            }
            Ok(result)
        }
        Err(msg) => {
            // Device-lost: rebuild once, then retry; otherwise surface the error for GDI fallback.
            let lower = msg.to_lowercase();
            let looks_lost = lower.contains("device")
                && (lower.contains("removed") || lower.contains("reset") || lower.contains("lost"));
            if looks_lost {
                rebuild_device_once(&mut rt)?;
                return capture_once_inner(&mut rt, hwnd, screen);
            }
            Err(msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_device_lost;
    use windows::core::{Error, HRESULT};
    use windows::Win32::Graphics::Dxgi::{DXGI_ERROR_DEVICE_REMOVED, DXGI_ERROR_DEVICE_RESET};

    #[test]
    fn device_lost_detects_dxgi_codes() {
        let removed = Error::from(HRESULT(DXGI_ERROR_DEVICE_REMOVED.0));
        let reset = Error::from(HRESULT(DXGI_ERROR_DEVICE_RESET.0));
        let other = Error::from(HRESULT(0x80004005u32 as i32)); // E_FAIL
        assert!(is_device_lost(&removed));
        assert!(is_device_lost(&reset));
        assert!(!is_device_lost(&other));
    }
}
