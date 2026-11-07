use crate::diagnostics::{
    build_diagnostics_bundle, BundleFile, BundleOptions, DiagnosticsInfo, MAX_NOTE_CHARS,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Strict allowlist of Windows Settings pages this app may open.
const ALLOWED_MS_SETTINGS_PAGES: &[&str] = &[
    "ms-settings:privacy-speech",
    "ms-settings:speech",
    "ms-settings:taskbar",
];

/// Opens a Windows Settings page (e.g. `ms-settings:privacy-speech`).
#[tauri::command]
pub fn cmd_open_windows_settings(app: AppHandle, uri: String) -> Result<(), String> {
    let trimmed = uri.trim();
    if !ALLOWED_MS_SETTINGS_PAGES
        .iter()
        .any(|allowed| *allowed == trimmed)
    {
        return Err("Windows Settings page is not allowed".to_string());
    }
    app.opener()
        .open_url(trimmed, None::<&str>)
        .map_err(|e| format!("Failed to open Windows Settings: {e}"))
}

#[tauri::command]
pub fn cmd_get_log_dir() -> String {
    crate::diagnostics::logs_dir().display().to_string()
}

#[tauri::command]
pub fn cmd_open_log_dir() -> Result<(), String> {
    let dir = crate::diagnostics::logs_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs folder: {e}"))?;
    open_logs_in_explorer(&dir)
}

#[tauri::command]
pub async fn cmd_collect_diagnostics() -> String {
    let logs_dir = crate::diagnostics::logs_dir();
    let info = crate::diagnostics::DiagnosticsInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        windows_build: crate::logging::windows_build_number().to_string(),
        webview2: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        previous_session: crate::diagnostics::previous_session_status().into(),
    };
    crate::diagnostics::collect_diagnostics_report(&logs_dir, &info)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendDiagnosticsResponse {
    pub configured: bool,
    pub files: Vec<BundleFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report_id: Option<String>,
}

#[tauri::command]
pub fn cmd_diagnostics_upload_available() -> bool {
    diagnostics_upload_configured()
}

#[tauri::command]
pub async fn cmd_send_diagnostics(
    app: AppHandle,
    send: Option<bool>,
    note: Option<String>,
) -> Result<SendDiagnosticsResponse, String> {
    tauri::async_runtime::spawn_blocking(move || send_diagnostics_blocking(&app, send, note))
        .await
        .map_err(|e| format!("send diagnostics task: {e}"))?
}

fn send_diagnostics_blocking(
    app: &AppHandle,
    send: Option<bool>,
    note: Option<String>,
) -> Result<SendDiagnosticsResponse, String> {
    if !diagnostics_upload_configured() {
        if send.unwrap_or(false) {
            return Err("not_configured".into());
        }
        return Ok(SendDiagnosticsResponse {
            configured: false,
            files: Vec::new(),
            report_id: None,
        });
    }

    let logs_dir = crate::diagnostics::logs_dir();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let (username, user_profile) = windows_user_identity();
    let note = note.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.chars().take(MAX_NOTE_CHARS).collect::<String>())
        }
    });
    let info = DiagnosticsInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        windows_build: crate::logging::windows_build_number().to_string(),
        webview2: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        previous_session: crate::diagnostics::previous_session_status().into(),
    };
    let bundle = build_diagnostics_bundle(&BundleOptions {
        logs_dir: &logs_dir,
        info: &info,
        note: note.as_deref(),
        username: &username,
        user_profile: &user_profile,
    })?;

    if !send.unwrap_or(false) {
        return Ok(SendDiagnosticsResponse {
            configured: true,
            files: bundle.files,
            report_id: None,
        });
    }

    let report_id = upload_diagnostics_zip(
        &bundle.zip_bytes,
        &install_id_hash(&app_data_dir)?,
        &info.version,
    )?;
    Ok(SendDiagnosticsResponse {
        configured: true,
        files: bundle.files,
        report_id: Some(report_id),
    })
}

pub(crate) fn diagnostics_upload_configured() -> bool {
    supabase_url().is_some() && supabase_anon_key().is_some()
}

fn supabase_url() -> Option<&'static str> {
    nonempty_env(option_env!("REACH_SUPABASE_URL"))
}

fn supabase_anon_key() -> Option<&'static str> {
    nonempty_env(option_env!("REACH_SUPABASE_ANON_KEY"))
}

fn nonempty_env(value: Option<&'static str>) -> Option<&'static str> {
    value.filter(|s| !s.is_empty())
}

fn windows_user_identity() -> (String, String) {
    (
        std::env::var("USERNAME").unwrap_or_default(),
        std::env::var("USERPROFILE").unwrap_or_default(),
    )
}

fn install_id_hash(app_data_dir: &Path) -> Result<String, String> {
    fs::create_dir_all(app_data_dir).map_err(|e| format!("create app data dir: {e}"))?;
    let path = app_data_dir.join("install-id");
    let raw = match fs::read_to_string(&path) {
        Ok(existing) if !existing.trim().is_empty() => existing.trim().to_string(),
        _ => {
            let id = uuid::Uuid::new_v4().to_string();
            fs::write(&path, &id).map_err(|e| format!("write install id: {e}"))?;
            id
        }
    };
    Ok(hex::encode(Sha256::digest(raw.as_bytes())))
}

fn upload_diagnostics_zip(
    zip_bytes: &[u8],
    install_hash: &str,
    version: &str,
) -> Result<String, String> {
    let Some(base) = supabase_url() else {
        return Err("not_configured".into());
    };
    let Some(anon_key) = supabase_anon_key() else {
        return Err("not_configured".into());
    };
    let endpoint = format!(
        "{}/functions/v1/submit-diagnostics",
        base.trim_end_matches('/')
    );
    let result = ureq::post(&endpoint)
        .set("Authorization", &format!("Bearer {anon_key}"))
        .set("Content-Type", "application/zip")
        .set("x-install-id", install_hash)
        .set("x-app-version", version)
        .timeout(Duration::from_secs(30))
        .send_bytes(zip_bytes);
    match result {
        Ok(resp) => {
            let parsed: UploadJson = resp
                .into_json()
                .map_err(|_| "invalid_response".to_string())?;
            if parsed.report_id.trim().is_empty() {
                log::warn!("diagnostics upload failed kind=missing_report_id");
                return Err("invalid_response".into());
            }
            log::info!("diagnostics uploaded report_id={}", parsed.report_id);
            Ok(parsed.report_id)
        }
        Err(ureq::Error::Status(code, _)) => {
            log::warn!("diagnostics upload failed status={code}");
            Err(upload_failure_code(Some(code), false))
        }
        Err(ureq::Error::Transport(_)) => {
            log::warn!("diagnostics upload failed kind=transport");
            Err(upload_failure_code(None, true))
        }
    }
}

#[derive(serde::Deserialize)]
struct UploadJson {
    report_id: String,
}

fn upload_failure_code(status: Option<u16>, transport: bool) -> String {
    if transport {
        return "transport".into();
    }
    match status {
        Some(code) => format!("http_{code}"),
        None => "unknown".into(),
    }
}

fn open_logs_in_explorer(dir: &Path) -> Result<(), String> {
    let explorer = std::env::var("WINDIR")
        .map(|windir| std::path::PathBuf::from(windir).join("explorer.exe"))
        .unwrap_or_else(|_| std::path::PathBuf::from(r"C:\Windows\explorer.exe"));
    Command::new(explorer)
        .arg(dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to open logs folder: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn empty_or_missing_env_is_unconfigured() {
        assert_eq!(nonempty_env(None), None);
        assert_eq!(nonempty_env(Some("")), None);
        assert_eq!(
            nonempty_env(Some("https://example.supabase.co")),
            Some("https://example.supabase.co")
        );
        if nonempty_env(option_env!("REACH_SUPABASE_URL")).is_none()
            || nonempty_env(option_env!("REACH_SUPABASE_ANON_KEY")).is_none()
        {
            assert!(!diagnostics_upload_configured());
        }
    }

    #[test]
    fn install_id_hash_is_sha256_hex_not_the_raw_uuid() {
        let dir = temp_dir("install-id");
        let uuid = "11111111-2222-3333-4444-555555555555";
        fs::write(dir.join("install-id"), uuid).expect("write id");
        let hash = install_id_hash(&dir).expect("hash");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(!hash.contains("11111111"));
        assert_ne!(hash, uuid);
        let again = install_id_hash(&dir).expect("reuse");
        assert_eq!(hash, again);
    }

    #[test]
    fn upload_failure_code_uses_status_or_transport() {
        assert_eq!(upload_failure_code(Some(429), false), "http_429");
        assert_eq!(upload_failure_code(Some(500), false), "http_500");
        assert_eq!(upload_failure_code(None, true), "transport");
    }
}
