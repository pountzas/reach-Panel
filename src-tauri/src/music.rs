use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// Max bytes accepted by `cmd_read_music_file` (JSON / MIDI / MusicXML imports).
const MAX_MUSIC_FILE_BYTES: u64 = 16 * 1024 * 1024;

const ALLOWED_MUSIC_EXTENSIONS: &[&str] = &["json", "mid", "midi", "xml", "musicxml", "mxl"];

/// Paths the user selected via the music file picker (canonical when possible).
fn allowed_read_paths() -> &'static Mutex<HashSet<PathBuf>> {
    static ALLOWED_READ_PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    ALLOWED_READ_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn music_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("music");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(music_dir(app)?.join("imported-songs.json"))
}

fn read_library(path: &Path) -> Result<Vec<Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    match value {
        Value::Array(items) => Ok(items),
        _ => Err("Imported songs library is not a JSON array".to_string()),
    }
}

fn write_library(path: &Path, songs: &[Value]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(songs).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn song_id(song: &Value) -> Option<&str> {
    song.get("id").and_then(|v| v.as_str())
}

pub fn list_imported_songs(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = library_path(app)?;
    read_library(&path)
}

pub fn upsert_imported_song(app: &AppHandle, song: Value) -> Result<Value, String> {
    let id = song_id(&song)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Imported song is missing id".to_string())?
        .to_string();
    let path = library_path(app)?;
    let mut songs = read_library(&path)?;
    if let Some(existing) = songs.iter_mut().find(|s| song_id(s) == Some(id.as_str())) {
        *existing = song.clone();
    } else {
        songs.push(song.clone());
    }
    write_library(&path, &songs)?;
    Ok(song)
}

pub fn delete_imported_song(app: &AppHandle, id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Song id is required".to_string());
    }
    let path = library_path(app)?;
    let songs = read_library(&path)?;
    let next: Vec<Value> = songs
        .into_iter()
        .filter(|s| song_id(s) != Some(id))
        .collect();
    write_library(&path, &next)?;
    Ok(())
}

/// Record a user-picked import path so a subsequent read is allowed.
pub fn allow_music_read_path(path: &Path) {
    let mut guard = allowed_read_paths()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Ok(canonical) = path.canonicalize() {
        guard.insert(canonical);
    } else {
        guard.insert(path.to_path_buf());
    }
}

fn has_allowed_music_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            ALLOWED_MUSIC_EXTENSIONS
                .iter()
                .any(|allowed| *allowed == lower)
        })
        .unwrap_or(false)
}

fn is_under_dir(path: &Path, root: &Path) -> bool {
    path.starts_with(root)
}

fn path_is_allowed(app: &AppHandle, canonical: &Path) -> Result<bool, String> {
    let music_root = music_dir(app)?;
    let music_root = music_root
        .canonicalize()
        .unwrap_or(music_root);
    if is_under_dir(canonical, &music_root) {
        return Ok(true);
    }
    let guard = allowed_read_paths()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(guard.contains(canonical))
}

/// Read a music import file after allowlist + size checks.
pub fn read_music_file_bytes(app: &AppHandle, path: &str) -> Result<Vec<u8>, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Music file path is empty".to_string());
    }
    if trimmed.contains('\0') {
        return Err("Music file path is invalid".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    if !has_allowed_music_extension(&candidate) {
        return Err("Music file type is not allowed".to_string());
    }

    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("Music file not found: {e}"))?;

    if !path_is_allowed(app, &canonical)? {
        return Err("Music file path is not allowed".to_string());
    }

    let meta = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Music path is not a file".to_string());
    }
    if meta.len() > MAX_MUSIC_FILE_BYTES {
        return Err(format!(
            "Music file exceeds maximum size of {MAX_MUSIC_FILE_BYTES} bytes"
        ));
    }

    fs::read(&canonical).map_err(|e| e.to_string())
}
