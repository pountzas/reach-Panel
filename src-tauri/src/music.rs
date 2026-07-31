use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

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

pub fn read_music_file_bytes(path: &str) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}
