//! Allowlisted school-book browser overlaid on the main Teaching panel.

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
use tauri::{LogicalPosition, LogicalSize, Position, Size};
use url::Url;

pub const TEACHING_EBOOK_WINDOW_LABEL: &str = "teaching-ebook";
pub const TEACHING_EBOOK_HOME: &str =
    "https://ebooks.edu.gr/ebooks/v2/allcoursesdiadrastika.jsp";
pub const TEACHING_EBOOK_NAVIGATED_EVENT: &str = "teaching-ebook-navigated";
pub const TEACHING_EBOOK_DESTROYED_EVENT: &str = "teaching-ebook-destroyed";

/// True when navigation should be allowed in the ebook webview.
pub fn is_teaching_ebook_url(url: &Url) -> bool {
    // WebView2 often hits about:blank during startup / blank-target handoff.
    if url.scheme() == "about" {
        return true;
    }
    matches!(url.scheme(), "https" | "http") && url.host_str() == Some("ebooks.edu.gr")
}

fn is_persistable_ebook_url(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http") && url.host_str() == Some("ebooks.edu.gr")
}

fn parse_external_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|e| e.to_string())?;
    if !is_persistable_ebook_url(&url) {
        return Err("URL is not allowed for the teaching ebook window".to_string());
    }
    Ok(url)
}

fn emit_navigated(app: &AppHandle, url: &Url) {
    if is_persistable_ebook_url(url) {
        let _ = app.emit(TEACHING_EBOOK_NAVIGATED_EVENT, url.as_str());
    }
}

fn place_over_main(app: &AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let pos = main.outer_position().map_err(|e| e.to_string())?;
    let size = main.outer_size().map_err(|e| e.to_string())?;
    let scale = main.scale_factor().unwrap_or(1.0);
    // Logical inset roughly under the teaching header inside main.
    let margin = 48.0;
    let logical_w = (size.width as f64 / scale).max(320.0) - margin * 2.0;
    let logical_h = (size.height as f64 / scale).max(240.0) - margin * 2.0 - 80.0;
    let logical_x = (pos.x as f64 / scale) + margin;
    let logical_y = (pos.y as f64 / scale) + margin + 80.0;
    window
        .set_position(Position::Logical(LogicalPosition::new(logical_x, logical_y)))
        .map_err(|e| e.to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(
            logical_w.max(280.0),
            logical_h.max(200.0),
        )))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Logical bounds relative to the **screen** (same space as window outer position).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EbookOverlayBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn sync_teaching_ebook_bounds(app: &AppHandle, bounds: EbookOverlayBounds) -> Result<(), String> {
    let window = match app.get_webview_window(TEACHING_EBOOK_WINDOW_LABEL) {
        Some(w) => w,
        None => return Ok(()),
    };
    if bounds.width < 40.0 || bounds.height < 40.0 {
        let _ = window.hide();
        return Ok(());
    }
    window
        .set_position(Position::Logical(LogicalPosition::new(bounds.x, bounds.y)))
        .map_err(|e| e.to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(bounds.width, bounds.height)))
        .map_err(|e| e.to_string())?;
    let _ = window.show();
    Ok(())
}

pub fn open_teaching_ebook(app: &AppHandle, url: Option<String>) -> Result<(), String> {
    let target = match url.as_deref() {
        Some(raw) if !raw.trim().is_empty() => parse_external_url(raw)?,
        _ => Url::parse(TEACHING_EBOOK_HOME).map_err(|e| e.to_string())?,
    };

    if let Some(existing) = app.get_webview_window(TEACHING_EBOOK_WINDOW_LABEL) {
        existing
            .navigate(target.clone())
            .map_err(|e| e.to_string())?;
        emit_navigated(app, &target);
        place_over_main(app, &existing)?;
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let app_nav = app.clone();
    let app_new = app.clone();
    let app_destroy = app.clone();

    let mut builder = WebviewWindowBuilder::new(
        app,
        TEACHING_EBOOK_WINDOW_LABEL,
        WebviewUrl::External(target.clone()),
    )
    .title("School books")
    .inner_size(800.0, 600.0)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .visible(true)
    .on_navigation(move |url| {
        let ok = is_teaching_ebook_url(url);
        if ok {
            emit_navigated(&app_nav, url);
        }
        ok
    })
    .on_new_window(move |url, _features| {
        if is_persistable_ebook_url(&url) {
            if let Some(window) = app_new.get_webview_window(TEACHING_EBOOK_WINDOW_LABEL) {
                let _ = window.navigate(url.clone());
                emit_navigated(&app_new, &url);
            }
        }
        NewWindowResponse::Deny
    });

    // Keep overlay tied to the main Teaching window (same monitor / z-order).
    builder = builder.parent(&main).map_err(|e| e.to_string())?;

    let window = builder.build().map_err(|e| e.to_string())?;
    place_over_main(app, &window)?;
    emit_navigated(app, &target);

    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = app_destroy.emit(TEACHING_EBOOK_DESTROYED_EVENT, ());
        }
    });

    Ok(())
}

pub fn teaching_ebook_home(app: &AppHandle) -> Result<(), String> {
    open_teaching_ebook(app, Some(TEACHING_EBOOK_HOME.to_string()))
}

pub fn teaching_ebook_back(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(TEACHING_EBOOK_WINDOW_LABEL)
        .ok_or_else(|| "Teaching ebook window is not open".to_string())?;
    window
        .eval("window.history.back()")
        .map_err(|e| e.to_string())
}

pub fn teaching_ebook_reload(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(TEACHING_EBOOK_WINDOW_LABEL)
        .ok_or_else(|| "Teaching ebook window is not open".to_string())?;
    window
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())
}

pub fn hide_teaching_ebook(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(TEACHING_EBOOK_WINDOW_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn close_teaching_ebook(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(TEACHING_EBOOK_WINDOW_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn teaching_ebook_is_open(app: &AppHandle) -> bool {
    app.get_webview_window(TEACHING_EBOOK_WINDOW_LABEL).is_some()
}

pub fn focus_teaching_ebook(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(TEACHING_EBOOK_WINDOW_LABEL)
        .ok_or_else(|| "Teaching ebook window is not open".to_string())?;
    let _ = window.show();
    window.set_focus().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_catalog_book_and_about_blank() {
        let catalog = Url::parse(TEACHING_EBOOK_HOME).unwrap();
        assert!(is_teaching_ebook_url(&catalog));
        let book = Url::parse(
            "https://ebooks.edu.gr/ebooks/v/html/8547/2156/Mathimatika_A-Dimotikou_html-empl/",
        )
        .unwrap();
        assert!(is_teaching_ebook_url(&book));
        assert!(is_teaching_ebook_url(&Url::parse("about:blank").unwrap()));
    }

    #[test]
    fn rejects_other_hosts() {
        let other = Url::parse("https://example.com/").unwrap();
        assert!(!is_teaching_ebook_url(&other));
        assert!(!is_persistable_ebook_url(&Url::parse("about:blank").unwrap()));
    }
}
