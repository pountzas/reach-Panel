use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// Max bytes accepted by `cmd_read_teaching_pdf`.
const MAX_TEACHING_PDF_BYTES: u64 = 32 * 1024 * 1024;

/// Paths the user selected via the teaching PDF picker (canonical when possible).
fn allowed_read_paths() -> &'static Mutex<HashSet<PathBuf>> {
    static ALLOWED_READ_PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    ALLOWED_READ_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn teaching_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("teaching");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(teaching_dir(app)?.join("pdf-library.json"))
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
        _ => Err("Teaching PDF library is not a JSON array".to_string()),
    }
}

fn write_library(path: &Path, entries: &[Value]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

pub fn list_teaching_pdfs(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = library_path(app)?;
    read_library(&path)
}

pub fn save_teaching_pdfs(app: &AppHandle, entries: Vec<Value>) -> Result<(), String> {
    let path = library_path(app)?;
    write_library(&path, &entries)
}

/// Record a user-picked PDF path so a subsequent read is allowed.
pub fn allow_teaching_pdf_read_path(path: &Path) {
    let mut guard = allowed_read_paths()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Ok(canonical) = path.canonicalize() {
        guard.insert(canonical);
    } else {
        guard.insert(path.to_path_buf());
    }
}

fn has_allowed_pdf_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

fn is_under_dir(path: &Path, root: &Path) -> bool {
    path.starts_with(root)
}

fn path_is_allowed(app: &AppHandle, canonical: &Path, original: &Path) -> Result<bool, String> {
    let teaching_root = teaching_dir(app)?;
    let teaching_root = teaching_root.canonicalize().unwrap_or(teaching_root);
    if is_under_dir(canonical, &teaching_root) || is_under_dir(original, &teaching_root) {
        return Ok(true);
    }
    {
        let guard = allowed_read_paths()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.contains(canonical) || guard.contains(original) {
            return Ok(true);
        }
    }
    // Paths persisted in the PDF library may be reopened after a restart.
    let library = list_teaching_pdfs(app)?;
    for entry in library {
        let Some(stored) = entry.get("path").and_then(|v| v.as_str()) else {
            continue;
        };
        let stored_path = PathBuf::from(stored);
        if stored_path == *original || stored_path == *canonical {
            return Ok(true);
        }
        if let Ok(stored_canonical) = stored_path.canonicalize() {
            if stored_canonical == *canonical {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Read a teaching PDF after allowlist + size checks.
pub fn read_teaching_pdf_bytes(app: &AppHandle, path: &str) -> Result<Vec<u8>, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Teaching PDF path is empty".to_string());
    }
    if trimmed.contains('\0') {
        return Err("Teaching PDF path is invalid".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    if !has_allowed_pdf_extension(&candidate) {
        return Err("Teaching PDF file type is not allowed".to_string());
    }

    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("Teaching PDF not found: {e}"))?;

    if !path_is_allowed(app, &canonical, &candidate)? {
        return Err("Teaching PDF path is not allowed".to_string());
    }

    let meta = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Teaching PDF path is not a file".to_string());
    }
    if meta.len() > MAX_TEACHING_PDF_BYTES {
        return Err(format!(
            "Teaching PDF exceeds maximum size of {MAX_TEACHING_PDF_BYTES} bytes"
        ));
    }

    fs::read(&canonical).map_err(|e| e.to_string())
}
