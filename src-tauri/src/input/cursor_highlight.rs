//! On-screen cursor highlight for assistive mouse use.
//!
//! Windows hides the pointer after touch (`CURSOR_SUPPRESSED`). Even after we
//! restore it via SendInput, a high-contrast ring helps find the pointer.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, Ellipse, EndPaint, FillRect,
    GetStockObject, SelectObject, SetBkMode, UpdateWindow, HBRUSH, HGDIOBJ, NULL_BRUSH,
    PAINTSTRUCT, PS_SOLID, TRANSPARENT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetClientRect, LoadCursorW, MoveWindow,
    RegisterClassW, ShowWindow, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, IDC_ARROW, SW_HIDE,
    SW_SHOWNOACTIVATE, WM_DESTROY, WM_PAINT, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP, SetLayeredWindowAttributes,
    LWA_COLORKEY,
};

const RING_SIZE: i32 = 72;
const RING_HALF: i32 = RING_SIZE / 2;
/// Magenta color key — fully transparent via LWA_COLORKEY.
const COLOR_KEY: COLORREF = COLORREF(0x00FF00FF);
const HIDE_AFTER: Duration = Duration::from_millis(900);

enum Cmd {
    Move { x: i32, y: i32 },
    SetSticky(bool),
    #[allow(dead_code)]
    Shutdown,
}

static STARTED: AtomicBool = AtomicBool::new(false);
static TX: OnceLock<SyncSender<Cmd>> = OnceLock::new();

/// Keep the ring visible while a trackpad gesture is held.
pub fn set_sticky(sticky: bool) {
    ensure_thread();
    if let Some(tx) = TX.get() {
        let _ = tx.try_send(Cmd::SetSticky(sticky));
    }
}

/// Show / refresh the highlight at screen coordinates (physical pixels).
pub fn nudge(x: i32, y: i32) {
    ensure_thread();
    if let Some(tx) = TX.get() {
        let _ = tx.try_send(Cmd::Move { x, y });
    }
}

fn ensure_thread() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let (tx, rx) = mpsc::sync_channel::<Cmd>(64);
    let _ = TX.set(tx);
    thread::Builder::new()
        .name("reach-cursor-highlight".into())
        .spawn(move || run_loop(rx))
        .expect("spawn cursor highlight thread");
}

fn run_loop(rx: mpsc::Receiver<Cmd>) {
    let class_name = w!("ReachPanelCursorHighlight");
    let class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(wnd_proc),
        hCursor: unsafe { LoadCursorW(None, IDC_ARROW).unwrap_or_default() },
        lpszClassName: class_name,
        hbrBackground: HBRUSH(std::ptr::null_mut()),
        ..Default::default()
    };
    unsafe {
        let _ = RegisterClassW(&class);
    }

    let hwnd = unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class_name,
            w!(""),
            WS_POPUP,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            RING_SIZE,
            RING_SIZE,
            None,
            None,
            None,
            None,
        )
    };
    let Ok(hwnd) = hwnd else {
        return;
    };

    unsafe {
        let _ = SetLayeredWindowAttributes(hwnd, COLOR_KEY, 0, LWA_COLORKEY);
        let _ = ShowWindow(hwnd, SW_HIDE);
    }

    let mut sticky = false;
    let mut hide_at = Instant::now();
    let mut last_pos: Option<(i32, i32)> = None;

    loop {
        while let Ok(cmd) = rx.try_recv() {
            match cmd {
                Cmd::Move { x, y } => {
                    last_pos = Some((x, y));
                    hide_at = Instant::now() + HIDE_AFTER;
                    position_window(hwnd, x, y);
                    unsafe {
                        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                        let _ = UpdateWindow(hwnd);
                    }
                }
                Cmd::SetSticky(v) => {
                    sticky = v;
                    if !sticky {
                        hide_at = Instant::now() + HIDE_AFTER;
                    } else if let Some((x, y)) = last_pos {
                        position_window(hwnd, x, y);
                        unsafe {
                            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                        }
                    }
                }
                Cmd::Shutdown => {
                    unsafe {
                        let _ = DestroyWindow(hwnd);
                    }
                    return;
                }
            }
        }

        let visible = sticky || Instant::now() < hide_at;
        if !visible {
            unsafe {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
        } else if let Some((x, y)) = last_pos {
            position_window(hwnd, x, y);
        }

        thread::sleep(Duration::from_millis(16));
    }
}

fn position_window(hwnd: HWND, x: i32, y: i32) {
    let left = x - RING_HALF;
    let top = y - RING_HALF;
    unsafe {
        let _ = MoveWindow(hwnd, left, top, RING_SIZE, RING_SIZE, true);
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = unsafe { BeginPaint(hwnd, &mut ps) };
            if !hdc.is_invalid() {
                let mut rect = RECT::default();
                let _ = unsafe { GetClientRect(hwnd, &mut rect) };
                let key_brush = unsafe { CreateSolidBrush(COLOR_KEY) };
                if !key_brush.is_invalid() {
                    let _ = unsafe { FillRect(hdc, &rect, key_brush) };
                    let _ = unsafe { DeleteObject(HGDIOBJ(key_brush.0 as _)) };
                }
                unsafe {
                    let _ = SetBkMode(hdc, TRANSPARENT);
                }
                let null_brush = unsafe { GetStockObject(NULL_BRUSH) };
                let old_brush = unsafe { SelectObject(hdc, null_brush) };

                let outer_pen = unsafe { CreatePen(PS_SOLID, 6, COLORREF(0x00000000)) };
                if !outer_pen.is_invalid() {
                    let old = unsafe { SelectObject(hdc, HGDIOBJ(outer_pen.0 as _)) };
                    let _ = unsafe { Ellipse(hdc, 4, 4, RING_SIZE - 4, RING_SIZE - 4) };
                    let _ = unsafe { SelectObject(hdc, old) };
                    let _ = unsafe { DeleteObject(HGDIOBJ(outer_pen.0 as _)) };
                }
                // Bright yellow ring for high visibility.
                let inner_pen = unsafe { CreatePen(PS_SOLID, 4, COLORREF(0x0000FFFF)) };
                if !inner_pen.is_invalid() {
                    let old = unsafe { SelectObject(hdc, HGDIOBJ(inner_pen.0 as _)) };
                    let _ = unsafe { Ellipse(hdc, 6, 6, RING_SIZE - 6, RING_SIZE - 6) };
                    let _ = unsafe { SelectObject(hdc, old) };
                    let _ = unsafe { DeleteObject(HGDIOBJ(inner_pen.0 as _)) };
                }
                let _ = unsafe { SelectObject(hdc, old_brush) };
            }
            let _ = unsafe { EndPaint(hwnd, &ps) };
            LRESULT(0)
        }
        WM_DESTROY => LRESULT(0),
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}
