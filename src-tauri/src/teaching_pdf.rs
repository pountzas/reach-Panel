use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// Max bytes accepted by `cmd_read_teaching_pdf`.
const MAX_TEACHING_PDF_BYTES: u64 = 32 * 1024 * 1024;

/// Rust-side allowlist of picker-approved canonical paths (persisted under the teaching dir).
const ALLOWED_READ_PATHS_FILE: &str = "allowed-read-paths.json";

struct AllowlistCache {
    loaded: bool,
    paths: HashSet<PathBuf>,
}

fn allowlist_cache() -> &'static Mutex<AllowlistCache> {
    static CACHE: OnceLock<Mutex<AllowlistCache>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Mutex::new(AllowlistCache {
            loaded: false,
            paths: HashSet::new(),
        })
    })
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

fn library_path(teaching_dir: &Path) -> PathBuf {
    teaching_dir.join("pdf-library.json")
}

fn allowlist_file(teaching_dir: &Path) -> PathBuf {
    teaching_dir.join(ALLOWED_READ_PATHS_FILE)
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

fn load_allowlist_from_disk(teaching_dir: &Path) -> Result<HashSet<PathBuf>, String> {
    let path = allowlist_file(teaching_dir);
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(HashSet::new());
    }
    let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let Value::Array(items) = value else {
        return Err("Teaching PDF allowlist is not a JSON array".to_string());
    };
    let mut out = HashSet::new();
    for item in items {
        let Some(s) = item.as_str() else {
            continue;
        };
        let p = PathBuf::from(s);
        if let Ok(canonical) = p.canonicalize() {
            out.insert(canonical);
        }
    }
    Ok(out)
}

fn persist_allowlist(teaching_dir: &Path, paths: &HashSet<PathBuf>) -> Result<(), String> {
    fs::create_dir_all(teaching_dir).map_err(|e| e.to_string())?;
    let list: Vec<Value> = paths
        .iter()
        .map(|p| Value::String(p.to_string_lossy().into_owned()))
        .collect();
    let text = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(allowlist_file(teaching_dir), text).map_err(|e| e.to_string())
}

fn canonicalize_teaching_root(teaching_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(teaching_dir).map_err(|e| e.to_string())?;
    teaching_dir
        .canonicalize()
        .map_err(|e| format!("Teaching directory is invalid: {e}"))
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

/// Allow when the canonical path is under the canonical teaching root or in the Rust allowlist.
fn path_allowed(
    canonical: &Path,
    teaching_root: &Path,
    allowlist: &HashSet<PathBuf>,
) -> bool {
    is_under_dir(canonical, teaching_root) || allowlist.contains(canonical)
}

/// Record a user-picked PDF path (canonical) and persist the allowlist.
pub(crate) fn allow_path_in_dir(
    teaching_dir: &Path,
    allowlist: &mut HashSet<PathBuf>,
    path: &Path,
) -> Result<(), String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Teaching PDF path could not be recorded: {e}"))?;
    allowlist.insert(canonical);
    persist_allowlist(teaching_dir, allowlist)
}

fn filter_entries_for_save(
    entries: Vec<Value>,
    teaching_root: &Path,
    allowlist: &HashSet<PathBuf>,
) -> Vec<Value> {
    entries
        .into_iter()
        .filter(|entry| {
            let Some(stored) = entry.get("path").and_then(|v| v.as_str()) else {
                return false;
            };
            let Ok(canonical) = PathBuf::from(stored).canonicalize() else {
                return false;
            };
            path_allowed(&canonical, teaching_root, allowlist)
        })
        .collect()
}

/// Read a teaching PDF after allowlist + size checks (path-based seam for tests).
pub(crate) fn read_teaching_pdf_bytes_in_dir(
    teaching_dir: &Path,
    allowlist: &HashSet<PathBuf>,
    path: &str,
) -> Result<Vec<u8>, String> {
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

    let teaching_root = canonicalize_teaching_root(teaching_dir)?;
    if !path_allowed(&canonical, &teaching_root, allowlist) {
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

fn with_allowlist_mut<R>(
    app: &AppHandle,
    f: impl FnOnce(&Path, &mut HashSet<PathBuf>) -> Result<R, String>,
) -> Result<R, String> {
    let dir = teaching_dir(app)?;
    let mut cache = allowlist_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if !cache.loaded {
        cache.paths = load_allowlist_from_disk(&dir)?;
        cache.loaded = true;
    }
    f(&dir, &mut cache.paths)
}

fn with_allowlist_ref<R>(
    app: &AppHandle,
    f: impl FnOnce(&Path, &HashSet<PathBuf>) -> Result<R, String>,
) -> Result<R, String> {
    with_allowlist_mut(app, |dir, paths| f(dir, paths))
}

pub fn list_teaching_pdfs(app: &AppHandle) -> Result<Vec<Value>, String> {
    let path = library_path(&teaching_dir(app)?);
    read_library(&path)
}

pub fn save_teaching_pdfs(app: &AppHandle, entries: Vec<Value>) -> Result<(), String> {
    with_allowlist_ref(app, |dir, allowlist| {
        let teaching_root = canonicalize_teaching_root(dir)?;
        let filtered = filter_entries_for_save(entries, &teaching_root, allowlist);
        write_library(&library_path(dir), &filtered)
    })
}

/// Record a user-picked PDF path so a subsequent read is allowed (persisted on disk).
pub fn allow_teaching_pdf_read_path(app: &AppHandle, path: &Path) {
    let _ = with_allowlist_mut(app, |dir, allowlist| {
        allow_path_in_dir(dir, allowlist, path)
    });
}

pub(crate) fn path_is_allowed(
    app: &AppHandle,
    canonical: &Path,
    _original: &Path,
) -> Result<bool, String> {
    with_allowlist_ref(app, |dir, allowlist| {
        let teaching_root = canonicalize_teaching_root(dir)?;
        Ok(path_allowed(canonical, &teaching_root, allowlist))
    })
}

/// Read a teaching PDF after allowlist + size checks.
pub fn read_teaching_pdf_bytes(app: &AppHandle, path: &str) -> Result<Vec<u8>, String> {
    with_allowlist_ref(app, |dir, allowlist| {
        read_teaching_pdf_bytes_in_dir(dir, allowlist, path)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_teaching_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-teaching-pdf-{nanos}"));
        fs::create_dir_all(&dir).expect("teaching dir");
        dir.canonicalize().expect("canonicalize teaching dir")
    }

    fn write_pdf(path: &Path, body: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(path, body).expect("write pdf");
    }

    #[test]
    fn rejects_path_that_resolves_outside_teaching_dir() {
        let teaching = temp_teaching_dir();
        let outside = teaching
            .parent()
            .expect("parent")
            .join(format!("outside-{}.pdf", teaching.file_name().unwrap().to_string_lossy()));
        write_pdf(&outside, b"%PDF-outside");

        let traversal = teaching.join("..").join(outside.file_name().unwrap());
        let allowlist = HashSet::new();
        let err = read_teaching_pdf_bytes_in_dir(
            &teaching,
            &allowlist,
            &traversal.to_string_lossy(),
        )
        .expect_err("outside path must be rejected");
        assert!(
            err.contains("not allowed"),
            "unexpected error: {err}"
        );
        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&teaching);
    }

    #[test]
    fn library_json_alone_does_not_authorize_read() {
        let teaching = temp_teaching_dir();
        let outside = teaching
            .parent()
            .expect("parent")
            .join(format!("lib-only-{}.pdf", teaching.file_name().unwrap().to_string_lossy()));
        write_pdf(&outside, b"%PDF-lib-only");

        let entries = vec![json!({
            "id": "untrusted",
            "title": "untrusted.pdf",
            "path": outside.to_string_lossy(),
            "lastOpenedAt": "2026-01-01T00:00:00.000Z",
        })];
        let allowlist = HashSet::new();
        let teaching_root = canonicalize_teaching_root(&teaching).unwrap();
        let filtered = filter_entries_for_save(entries, &teaching_root, &allowlist);
        assert!(
            filtered.is_empty(),
            "save must drop paths not on the Rust allowlist"
        );
        write_library(&library_path(&teaching), &filtered).unwrap();

        let err = read_teaching_pdf_bytes_in_dir(
            &teaching,
            &allowlist,
            &outside.to_string_lossy(),
        )
        .expect_err("path never picked must not be readable");
        assert!(err.contains("not allowed"), "unexpected error: {err}");

        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&teaching);
    }

    #[test]
    fn picked_pdf_readable_after_allowlist_reload() {
        let teaching = temp_teaching_dir();
        let picked = teaching
            .parent()
            .expect("parent")
            .join(format!("picked-{}.pdf", teaching.file_name().unwrap().to_string_lossy()));
        write_pdf(&picked, b"%PDF-picked");

        let mut allowlist = HashSet::new();
        allow_path_in_dir(&teaching, &mut allowlist, &picked).expect("allow pick");

        // Simulate process restart: memory cleared, reload from disk.
        allowlist.clear();
        allowlist = load_allowlist_from_disk(&teaching).expect("reload allowlist");

        let bytes = read_teaching_pdf_bytes_in_dir(
            &teaching,
            &allowlist,
            &picked.to_string_lossy(),
        )
        .expect("picked path must remain readable after reload");
        assert_eq!(bytes, b"%PDF-picked");

        let teaching_root = canonicalize_teaching_root(&teaching).unwrap();
        let saved = filter_entries_for_save(
            vec![json!({
                "id": "picked",
                "title": "picked.pdf",
                "path": picked.to_string_lossy(),
                "lastOpenedAt": "2026-01-01T00:00:00.000Z",
            })],
            &teaching_root,
            &allowlist,
        );
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0]["id"], "picked");
        assert_eq!(saved[0]["title"], "picked.pdf");

        let _ = fs::remove_file(&picked);
        let _ = fs::remove_dir_all(&teaching);
    }

    #[test]
    fn files_inside_teaching_dir_open_with_extension_and_size_checks() {
        let teaching = temp_teaching_dir();
        let inside = teaching.join("lesson.pdf");
        write_pdf(&inside, b"%PDF-inside");
        let allowlist = HashSet::new();

        let bytes = read_teaching_pdf_bytes_in_dir(
            &teaching,
            &allowlist,
            &inside.to_string_lossy(),
        )
        .expect("in-dir pdf must open without picker allowlist");
        assert_eq!(bytes, b"%PDF-inside");

        let not_pdf = teaching.join("notes.txt");
        fs::write(&not_pdf, b"hello").unwrap();
        let err = read_teaching_pdf_bytes_in_dir(
            &teaching,
            &allowlist,
            &not_pdf.to_string_lossy(),
        )
        .expect_err("non-pdf must be rejected");
        assert!(err.contains("file type"), "unexpected error: {err}");

        let _ = fs::remove_dir_all(&teaching);
    }
}
