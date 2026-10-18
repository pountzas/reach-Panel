use std::path::PathBuf;
use tauri::Manager;

/// Temporarily drops always-on-top so native file dialogs appear above the app window.
struct RestoreAlwaysOnTop(tauri::AppHandle);

impl Drop for RestoreAlwaysOnTop {
    fn drop(&mut self) {
        if let Some(window) = self.0.get_webview_window("main") {
            let _ = window.set_always_on_top(true);
        }
    }
}

#[derive(Clone, Copy)]
enum PickMode<'a> {
    Open,
    Save { suggested_name: &'a str },
}

fn pick_file(
    app: &tauri::AppHandle,
    filters: &[(&str, &[&str])],
    mode: PickMode<'_>,
) -> Result<Option<PathBuf>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    let _restore = RestoreAlwaysOnTop(app.clone());

    let mut dialog = rfd::FileDialog::new();
    for (name, extensions) in filters {
        dialog = dialog.add_filter(*name, extensions);
    }
    dialog = dialog.set_parent(&window);

    let file = match mode {
        PickMode::Open => dialog.pick_file(),
        PickMode::Save { suggested_name } => dialog.set_file_name(suggested_name).save_file(),
    };
    Ok(file)
}

fn pick_background_image(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let file = pick_file(
        app,
        &[("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"])],
        PickMode::Open,
    )?;
    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}

fn pick_music_song_file(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let file = pick_file(
        app,
        &[
            (
                "Music songs",
                &["json", "mid", "midi", "xml", "musicxml", "mxl"],
            ),
            ("JSON", &["json"]),
            ("MIDI", &["mid", "midi"]),
            ("MusicXML", &["xml", "musicxml", "mxl"]),
        ],
        PickMode::Open,
    )?;
    Ok(file.map(|p| {
        crate::music::allow_music_read_path(&p);
        p.to_string_lossy().into_owned()
    }))
}

fn pick_teaching_pdf(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let file = pick_file(app, &[("PDF", &["pdf"])], PickMode::Open)?;
    match file {
        Some(p) => {
            crate::teaching_pdf::allow_teaching_pdf_read_path(app, &p)?;
            Ok(Some(p.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

fn pick_teaching_reach_export_path(
    app: &tauri::AppHandle,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let file = pick_file(
        app,
        &[("PDF", &["pdf"])],
        PickMode::Save {
            suggested_name: &suggested_name,
        },
    )?;
    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn cmd_pick_background_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_background_image(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cmd_pick_music_song_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_music_song_file(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cmd_pick_teaching_pdf(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_teaching_pdf(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cmd_pick_teaching_reach_export_path(
    app: tauri::AppHandle,
    suggested_name: String,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || pick_teaching_reach_export_path(&app, suggested_name))
        .await
        .map_err(|e| e.to_string())?
}
