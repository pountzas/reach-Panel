//! Re-apply Windows HWND icons when WebView2 creates or reparents child windows.

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{Manager, Webview, WebviewWindow, WindowEvent};

use super::taskbar_icon;

pub(crate) fn try_apply_embedded_window_icons(window: &WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
    if let Err(e) = taskbar_icon::apply_embedded_icons_to_window_tree(hwnd) {
        eprintln!("Failed to apply embedded window icons: {e}");
    }
}

pub(crate) fn on_app_page_load(webview: &Webview, payload: &PageLoadPayload<'_>) {
    if payload.event() != PageLoadEvent::Finished {
        return;
    }
    let app = webview.app_handle();
    if let Some(window) = app.get_webview_window("main") {
        try_apply_embedded_window_icons(&window);
    }
}

pub(crate) fn register_main_window_icon_sync(window: WebviewWindow) {
    let window_for_events = window.clone();
    window.on_window_event(move |event| {
        match event {
            WindowEvent::Focused(true) | WindowEvent::Resized(_) => {
                try_apply_embedded_window_icons(&window_for_events);
            }
            _ => {}
        }
    });

    try_apply_embedded_window_icons(&window);
}
