use crate::db::{Database, PredictionEntry};
use crate::input::windows_ui_language;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const ACTIVE_PROFILE_CONFIG: &str = "active_profile.txt";
pub const INTERNAL_PROFILE_ID: &str = "active";
const DEFAULT_PROFILE_FILENAME: &str = "default.profile.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFileInfo {
    pub filename: String,
    pub name: String,
}

/// On-disk profile. Legacy fields (phrases, QA, macros, head_tracking) are ignored
/// on import via serde's default unknown-field skip; they are never re-exported.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFile {
    pub name: String,
    pub settings: serde_json::Value,
    pub predictions: Vec<PredictionEntry>,
}

pub struct ProfileStore {
    profiles_dir: PathBuf,
    active_filename: Mutex<String>,
    /// Serializes load/save/create/delete/wipe so DB content and active
    /// filename cannot diverge while another thread exports to disk.
    io_lock: Mutex<()>,
}

impl ProfileStore {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let profiles_dir = app_data_dir.join("profiles");
        fs::create_dir_all(&profiles_dir)?;
        let active_filename = Self::read_active_filename(&profiles_dir)?;
        Ok(Self {
            profiles_dir,
            active_filename: Mutex::new(active_filename),
            io_lock: Mutex::new(()),
        })
    }

    fn read_active_filename(profiles_dir: &Path) -> Result<String> {
        let config_path = profiles_dir.join(ACTIVE_PROFILE_CONFIG);
        if config_path.exists() {
            let name = fs::read_to_string(config_path)?.trim().to_string();
            if !name.is_empty() && profiles_dir.join(&name).exists() {
                return Ok(name);
            }
        }
        Ok(String::new())
    }

    fn write_active_filename(&self, filename: &str) -> Result<()> {
        let config_path = self.profiles_dir.join(ACTIVE_PROFILE_CONFIG);
        fs::write(config_path, filename)?;
        let mut guard = self
            .active_filename
            .lock()
            .map_err(|_| anyhow!("lock poisoned"))?;
        *guard = filename.to_string();
        Ok(())
    }

    fn lock_io(&self) -> Result<std::sync::MutexGuard<'_, ()>> {
        self.io_lock
            .lock()
            .map_err(|_| anyhow!("profile IO lock poisoned"))
    }

    /// Accept only a single filename component directly under `profiles_dir`.
    /// Rejects separators, `.`, `..`, and any path that escapes the profiles dir.
    fn validated_profile_path(&self, filename: &str) -> Result<PathBuf> {
        if filename.is_empty()
            || filename == "."
            || filename == ".."
            || filename.contains('/')
            || filename.contains('\\')
            || filename.contains('\0')
        {
            return Err(anyhow!("Invalid profile filename: {filename}"));
        }
        let as_path = Path::new(filename);
        if as_path.components().count() != 1 {
            return Err(anyhow!("Invalid profile filename: {filename}"));
        }
        match as_path.components().next() {
            Some(std::path::Component::Normal(_)) => {}
            _ => return Err(anyhow!("Invalid profile filename: {filename}")),
        }

        let path = self.profiles_dir.join(filename);
        let parent = path
            .parent()
            .ok_or_else(|| anyhow!("Invalid profile filename: {filename}"))?;
        if parent != self.profiles_dir {
            return Err(anyhow!("Invalid profile filename: {filename}"));
        }
        Ok(path)
    }

    pub fn ensure_default_profile_file(&self, db: &Database) -> Result<String> {
        let _guard = self.lock_io()?;
        let files = self.list_profile_files()?;
        if !files.is_empty() {
            let active = self
                .active_filename
                .lock()
                .map_err(|_| anyhow!("lock poisoned"))?
                .clone();
            let filename = if active.is_empty() {
                files[0].filename.clone()
            } else {
                active
            };
            self.load_profile_file_locked(db, &filename)?;
            return Ok(filename);
        }

        let filename = DEFAULT_PROFILE_FILENAME.to_string();
        let ui_language = windows_ui_language();
        db.ensure_internal_profile(INTERNAL_PROFILE_ID, "Default", &ui_language)?;
        let file = export_profile_from_db(db, INTERNAL_PROFILE_ID)?;
        let path = self.profiles_dir.join(&filename);
        fs::write(path, serde_json::to_string_pretty(&file)?)?;
        self.write_active_filename(&filename)?;
        Ok(filename)
    }

    pub fn list_profile_files(&self) -> Result<Vec<ProfileFileInfo>> {
        let mut files = Vec::new();
        for entry in fs::read_dir(&self.profiles_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            let name = match fs::read_to_string(&path) {
                Ok(content) => serde_json::from_str::<ProfileFile>(&content)
                    .map(|p| p.name)
                    .unwrap_or_else(|_| filename.clone()),
                Err(_) => filename.clone(),
            };
            files.push(ProfileFileInfo { filename, name });
        }
        files.sort_by(|a, b| a.filename.cmp(&b.filename));
        Ok(files)
    }

    pub fn active_filename(&self) -> Result<String> {
        Ok(self
            .active_filename
            .lock()
            .map_err(|_| anyhow!("lock poisoned"))?
            .clone())
    }

    pub fn load_profile_file(&self, db: &Database, filename: &str) -> Result<()> {
        let _guard = self.lock_io()?;
        self.load_profile_file_locked(db, filename)
    }

    fn load_profile_file_locked(&self, db: &Database, filename: &str) -> Result<()> {
        let path = self.profiles_dir.join(filename);
        if !path.exists() {
            return Err(anyhow!("Profile file not found: {filename}"));
        }
        let content = fs::read_to_string(path)?;
        let file: ProfileFile = serde_json::from_str(&content)?;
        // Import then point active at this file under the same IO lock so a
        // concurrent save cannot export the new DB into the previous filename.
        import_profile_into_db(db, INTERNAL_PROFILE_ID, &file)?;
        self.write_active_filename(filename)?;
        Ok(())
    }

    pub fn save_active_profile(&self, db: &Database) -> Result<()> {
        let _guard = self.lock_io()?;
        self.save_active_profile_locked(db)
    }

    fn save_active_profile_locked(&self, db: &Database) -> Result<()> {
        let filename = self.active_filename()?;
        if filename.is_empty() {
            return Err(anyhow!("No active profile file to save"));
        }
        let file = export_profile_from_db(db, INTERNAL_PROFILE_ID)?;
        let path = self.profiles_dir.join(&filename);
        fs::write(path, serde_json::to_string_pretty(&file)?)?;
        Ok(())
    }

    pub fn create_profile_file(&self, db: &Database, filename: &str, name: &str) -> Result<()> {
        let _guard = self.lock_io()?;
        let safe_name = if filename.ends_with(".profile.json") {
            filename.to_string()
        } else {
            format!("{filename}.profile.json")
        };
        let path = self.validated_profile_path(&safe_name)?;
        if path.exists() {
            return Err(anyhow!("Profile file already exists"));
        }
        let ui_language = windows_ui_language();
        db.reset_profile_to_defaults(INTERNAL_PROFILE_ID, name, &ui_language)?;
        self.write_active_filename(&safe_name)?;
        self.save_active_profile_locked(db)?;
        Ok(())
    }

    /// Reset settings + wipe predictions, keep profile filename/name.
    pub fn wipe_active_profile(&self, db: &Database) -> Result<()> {
        let _guard = self.lock_io()?;
        let name = db
            .get_profile_by_id(INTERNAL_PROFILE_ID)?
            .map(|p| p.name)
            .unwrap_or_else(|| "Default".to_string());
        let ui_language = windows_ui_language();
        db.reset_profile_to_defaults(INTERNAL_PROFILE_ID, &name, &ui_language)?;
        self.save_active_profile_locked(db)?;
        Ok(())
    }

    /// Delete a profile file. If it was active (or last), fall back to `default.profile.json`.
    pub fn delete_profile_file(&self, db: &Database, filename: &str) -> Result<String> {
        let _guard = self.lock_io()?;
        let path = self.validated_profile_path(filename)?;
        if !path.exists() {
            return Err(anyhow!("Profile file not found: {filename}"));
        }

        let active = self.active_filename()?;
        let was_active = active == filename;
        fs::remove_file(&path)?;

        if !was_active {
            let remaining = self.list_profile_files()?;
            if remaining.is_empty() {
                return self.recreate_default_profile_locked(db);
            }
            return Ok(active);
        }

        self.recreate_default_profile_locked(db)
    }

    fn recreate_default_profile_locked(&self, db: &Database) -> Result<String> {
        let filename = DEFAULT_PROFILE_FILENAME.to_string();
        let path = self.profiles_dir.join(&filename);
        if path.exists() {
            self.load_profile_file_locked(db, &filename)?;
            return Ok(filename);
        }
        let ui_language = windows_ui_language();
        db.reset_profile_to_defaults(INTERNAL_PROFILE_ID, "Default", &ui_language)?;
        self.write_active_filename(&filename)?;
        self.save_active_profile_locked(db)?;
        Ok(filename)
    }
}

/// Settings keys for features removed in #225. Stripped on import and export so
/// old profile files still load and new exports never carry them.
const REMOVED_SETTINGS_KEYS: &[&str] = &[
    "quickActionsVisible",
    "phrasesVisible",
    "largeHeaders",
    "headTrackingEnabled",
    "emergencyVisible",
    "precisionMode",
];

fn strip_removed_settings_keys(mut settings: serde_json::Value) -> serde_json::Value {
    if let Some(obj) = settings.as_object_mut() {
        for key in REMOVED_SETTINGS_KEYS {
            obj.remove(*key);
        }
    }
    settings
}

fn export_profile_from_db(db: &Database, profile_id: &str) -> Result<ProfileFile> {
    let profile = db
        .get_profile_by_id(profile_id)?
        .ok_or_else(|| anyhow!("Profile not found"))?;
    let settings: serde_json::Value = serde_json::from_str(&profile.settings_json)?;
    let predictions = db.get_all_predictions(profile_id)?;
    Ok(ProfileFile {
        name: profile.name,
        settings: strip_removed_settings_keys(settings),
        predictions,
    })
}

fn import_profile_into_db(db: &Database, profile_id: &str, file: &ProfileFile) -> Result<()> {
    let settings = strip_removed_settings_keys(file.settings.clone());
    let ui_language = settings
        .get("uiLanguage")
        .and_then(|v| v.as_str())
        .unwrap_or("en");
    db.ensure_internal_profile(profile_id, &file.name, ui_language)?;
    db.clear_profile_data(profile_id)?;
    db.update_profile_settings(profile_id, &settings.to_string())?;

    for entry in &file.predictions {
        db.insert_prediction(profile_id, entry)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
