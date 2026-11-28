use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPrefs {
    #[serde(default)]
    pub focus_mode_hidden_tip_dismissed: bool,
}

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .map(|d| d.join("install_prefs.json"))
}

/// Production read path (path-based seam for tests).
pub(crate) fn read_install_prefs_at(path: &Path) -> Result<InstallPrefs, String> {
    if !path.exists() {
        return Ok(InstallPrefs::default());
    }
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

pub fn read_install_prefs(app: &AppHandle) -> Result<InstallPrefs, String> {
    read_install_prefs_at(&prefs_path(app)?)
}

pub fn write_install_prefs(app: &AppHandle, prefs: &InstallPrefs) -> Result<(), String> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_json_file_returns_default_prefs() {
        let dir = std::env::temp_dir().join(format!(
            "reach-panel-install-prefs-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("install_prefs.json");
        fs::write(&path, "{not json").expect("write corrupt prefs");
        let prefs = read_install_prefs_at(&path).expect("corrupt file must not error");
        assert!(!prefs.focus_mode_hidden_tip_dismissed);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn serializes_focus_mode_hidden_tip_dismissed() {
        let prefs = InstallPrefs {
            focus_mode_hidden_tip_dismissed: true,
        };
        let json = serde_json::to_string(&prefs).unwrap();
        let read: InstallPrefs = serde_json::from_str(&json).unwrap();
        assert!(read.focus_mode_hidden_tip_dismissed);
    }
}