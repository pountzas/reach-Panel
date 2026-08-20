use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn language_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("language");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(language_dir(app)?.join("custom-packs.json"))
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
        _ => Err("Custom language packs library is not a JSON array".to_string()),
    }
}

fn write_library(path: &Path, packs: &[Value]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(packs).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn pack_id(pack: &Value) -> Option<&str> {
    pack.get("id").and_then(|v| v.as_str())
}

pub fn list_custom_language_packs(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = library_path(app)?;
    read_library(&path)
}

pub fn upsert_custom_language_pack(app: &AppHandle, pack: Value) -> Result<Value, String> {
    let id = pack_id(&pack)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Custom language pack is missing id".to_string())?
        .to_string();
    let path = library_path(app)?;
    let mut packs = read_library(&path)?;
    if let Some(existing) = packs.iter_mut().find(|p| pack_id(p) == Some(id.as_str())) {
        *existing = pack.clone();
    } else {
        packs.push(pack.clone());
    }
    write_library(&path, &packs)?;
    Ok(pack)
}

pub fn delete_custom_language_pack(app: &AppHandle, id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Pack id is required".to_string());
    }
    let path = library_path(app)?;
    let packs = read_library(&path)?;
    let next: Vec<Value> = packs
        .into_iter()
        .filter(|p| pack_id(p) != Some(id))
        .collect();
    write_library(&path, &next)?;
    Ok(())
}
