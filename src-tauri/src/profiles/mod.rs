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
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-profile-test-{nanos}"));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn write_profile(dir: &Path, filename: &str, name: &str, marker: &str) {
        let file = ProfileFile {
            name: name.to_string(),
            settings: json!({
                "uiLanguage": "en",
                "appBgColor": marker,
                "groqApiKey": format!("key-{marker}"),
            }),
            predictions: vec![],
        };
        fs::write(
            dir.join("profiles").join(filename),
            serde_json::to_string_pretty(&file).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn switch_then_save_does_not_clobber_previous_profile() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        fs::create_dir_all(root.join("profiles")).unwrap();

        write_profile(&root, "a.profile.json", "A", "#aaa");
        write_profile(&root, "b.profile.json", "B", "#bbb");
        fs::write(
            root.join("profiles").join(ACTIVE_PROFILE_CONFIG),
            "a.profile.json",
        )
        .unwrap();

        // Re-read active after writing config.
        let store = ProfileStore::new(&root).expect("store");
        store
            .load_profile_file(&db, "a.profile.json")
            .expect("load a");

        // Simulate the race window: import B into DB, then save while still
        // pointing at A would historically overwrite A. With the IO lock,
        // load completes (active=B) before any save can run.
        store
            .load_profile_file(&db, "b.profile.json")
            .expect("load b");
        store.save_active_profile(&db).expect("save");

        let a: ProfileFile = serde_json::from_str(
            &fs::read_to_string(root.join("profiles").join("a.profile.json")).unwrap(),
        )
        .unwrap();
        let b: ProfileFile = serde_json::from_str(
            &fs::read_to_string(root.join("profiles").join("b.profile.json")).unwrap(),
        )
        .unwrap();

        assert_eq!(
            a.settings.get("appBgColor").and_then(|v| v.as_str()),
            Some("#aaa")
        );
        assert_eq!(
            a.settings.get("groqApiKey").and_then(|v| v.as_str()),
            Some("key-#aaa")
        );
        assert_eq!(
            b.settings.get("appBgColor").and_then(|v| v.as_str()),
            Some("#bbb")
        );
        assert_eq!(store.active_filename().unwrap(), "b.profile.json");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_switch_preserves_custom_settings() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        fs::create_dir_all(root.join("profiles")).unwrap();

        write_profile(&root, "a.profile.json", "A", "#aaa");
        write_profile(&root, "b.profile.json", "B", "#bbb");
        fs::write(
            root.join("profiles").join(ACTIVE_PROFILE_CONFIG),
            "a.profile.json",
        )
        .unwrap();

        let store = ProfileStore::new(&root).expect("store");
        store
            .load_profile_file(&db, "a.profile.json")
            .expect("load a");

        // Mutate active (A) settings and persist.
        db.update_profile_settings(
            INTERNAL_PROFILE_ID,
            &serde_json::json!({
                "uiLanguage": "en",
                "appBgColor": "#custom-a",
                "groqApiKey": "secret-a",
            })
            .to_string(),
        )
        .unwrap();
        store.save_active_profile(&db).expect("save a");

        store
            .load_profile_file(&db, "b.profile.json")
            .expect("load b");
        store
            .load_profile_file(&db, "a.profile.json")
            .expect("load a again");

        let profile = db.get_profile_by_id(INTERNAL_PROFILE_ID).unwrap().unwrap();
        let settings: serde_json::Value = serde_json::from_str(&profile.settings_json).unwrap();
        assert_eq!(
            settings.get("appBgColor").and_then(|v| v.as_str()),
            Some("#custom-a")
        );
        assert_eq!(
            settings.get("groqApiKey").and_then(|v| v.as_str()),
            Some("secret-a")
        );
        assert_eq!(store.active_filename().unwrap(), "a.profile.json");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn concurrent_switch_and_save_keeps_profiles_isolated() {
        use std::sync::Arc;
        use std::thread;

        let root = temp_dir();
        let db = Arc::new(Database::new(root.clone()).expect("db"));
        fs::create_dir_all(root.join("profiles")).unwrap();
        write_profile(&root, "a.profile.json", "A", "#aaa");
        write_profile(&root, "b.profile.json", "B", "#bbb");
        fs::write(
            root.join("profiles").join(ACTIVE_PROFILE_CONFIG),
            "a.profile.json",
        )
        .unwrap();

        let store = Arc::new(ProfileStore::new(&root).expect("store"));
        store
            .load_profile_file(&db, "a.profile.json")
            .expect("load a");

        let mut handles = Vec::new();
        for i in 0..8 {
            let store = Arc::clone(&store);
            let db = Arc::clone(&db);
            handles.push(thread::spawn(move || {
                if i % 2 == 0 {
                    store
                        .load_profile_file(&db, "b.profile.json")
                        .expect("load b");
                } else {
                    store.save_active_profile(&db).expect("save");
                }
            }));
        }
        for handle in handles {
            handle.join().expect("thread");
        }

        // Final explicit switch + save should leave both files self-consistent.
        store
            .load_profile_file(&db, "a.profile.json")
            .expect("load a final");
        store.save_active_profile(&db).expect("save a final");
        store
            .load_profile_file(&db, "b.profile.json")
            .expect("load b final");
        store.save_active_profile(&db).expect("save b final");

        let a: ProfileFile = serde_json::from_str(
            &fs::read_to_string(root.join("profiles").join("a.profile.json")).unwrap(),
        )
        .unwrap();
        let b: ProfileFile = serde_json::from_str(
            &fs::read_to_string(root.join("profiles").join("b.profile.json")).unwrap(),
        )
        .unwrap();

        let a_color = a
            .settings
            .get("appBgColor")
            .and_then(|v| v.as_str())
            .unwrap();
        let b_color = b
            .settings
            .get("appBgColor")
            .and_then(|v| v.as_str())
            .unwrap();
        // Neither file should contain the other profile's original marker after a
        // clean final load/save of each.
        assert!(
            a_color == "#aaa" || a_color == "#bbb",
            "unexpected a color {a_color}"
        );
        assert_eq!(b_color, "#bbb");
        // A must not have been permanently replaced with B's identity if we
        // finished on a clean load of A then B — B stays B; A stays A's marker
        // unless a save raced after loading B into the shared DB *before* active
        // was updated. The IO lock forbids that corruption path.
        assert_eq!(a_color, "#aaa");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn import_tolerates_legacy_head_tracking_and_phrase_fields() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        fs::create_dir_all(root.join("profiles")).unwrap();
        let legacy = json!({
            "name": "Legacy",
            "settings": {
                "uiLanguage": "en",
                "appBgColor": "#legacy",
                "quickActionsVisible": true,
                "phrasesVisible": true,
                "largeHeaders": true,
                "headTrackingEnabled": true,
                "emergencyVisible": true,
                "precisionMode": true
            },
            "quick_actions": [],
            "phrase_categories": [],
            "phrases": [],
            "macros": [],
            "predictions": [],
            "head_tracking_settings": { "sensitivity": 5 }
        });
        fs::write(
            root.join("profiles").join("legacy.profile.json"),
            serde_json::to_string_pretty(&legacy).unwrap(),
        )
        .unwrap();
        let store = ProfileStore::new(&root).expect("store");
        store
            .load_profile_file(&db, "legacy.profile.json")
            .expect("legacy import");
        let exported = export_profile_from_db(&db, INTERNAL_PROFILE_ID).expect("export");
        let wire = serde_json::to_value(&exported).unwrap();
        assert!(wire.get("head_tracking_settings").is_none());
        assert!(wire.get("phrases").is_none());
        assert!(wire.get("quick_actions").is_none());
        assert_eq!(
            exported
                .settings
                .get("appBgColor")
                .and_then(|v| v.as_str()),
            Some("#legacy")
        );
        for key in [
            "quickActionsVisible",
            "phrasesVisible",
            "largeHeaders",
            "headTrackingEnabled",
            "emergencyVisible",
            "precisionMode",
        ] {
            assert!(
                exported.settings.get(key).is_none(),
                "removed setting {key} must not survive import/export"
            );
        }
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn save_without_active_profile_errors() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        let store = ProfileStore::new(&root).expect("store");
        let err = store.save_active_profile(&db).expect_err("should fail");
        assert!(err.to_string().contains("No active profile file to save"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn deleting_custom_profile_preserves_existing_default() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        let store = ProfileStore::new(&root).expect("store");
        store.ensure_default_profile_file(&db).unwrap();
        db.update_profile_settings(
            INTERNAL_PROFILE_ID,
            r##"{"uiLanguage":"en","appBgColor":"#123456"}"##,
        )
        .unwrap();
        store.save_active_profile(&db).unwrap();

        let default = root.join("profiles").join(DEFAULT_PROFILE_FILENAME);
        let before = fs::read(&default).unwrap();

        store.create_profile_file(&db, "custom", "Custom").unwrap();
        store
            .delete_profile_file(&db, "custom.profile.json")
            .unwrap();

        assert_eq!(
            fs::read(&default).unwrap(),
            before,
            "Deleting Custom must not overwrite the unrelated Default profile"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn failed_create_keeps_original_active_profile_and_settings() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        let store = ProfileStore::new(&root).expect("store");
        store.ensure_default_profile_file(&db).unwrap();
        db.update_profile_settings(
            INTERNAL_PROFILE_ID,
            r##"{"uiLanguage":"en","appBgColor":"#123456"}"##,
        )
        .unwrap();
        store.save_active_profile(&db).unwrap();

        let before_file = store.active_filename().unwrap();
        let before_settings = db
            .get_profile_by_id(INTERNAL_PROFILE_ID)
            .unwrap()
            .unwrap()
            .settings_json;

        assert!(store
            .create_profile_file(&db, "missing-directory/child", "Child")
            .is_err());
        assert_eq!(
            store.active_filename().unwrap(),
            before_file,
            "A failed Create must leave the current profile active"
        );
        assert_eq!(
            db.get_profile_by_id(INTERNAL_PROFILE_ID)
                .unwrap()
                .unwrap()
                .settings_json,
            before_settings
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn delete_rejects_paths_outside_profiles_directory() {
        let root = temp_dir();
        let db = Database::new(root.clone()).expect("db");
        let store = ProfileStore::new(&root).expect("store");
        store.ensure_default_profile_file(&db).unwrap();

        let unrelated = root.join("unrelated.txt");
        fs::write(&unrelated, "must survive").unwrap();

        let result = store.delete_profile_file(&db, "../unrelated.txt");
        assert!(
            result.is_err(),
            "Profile delete accepted a path outside profiles"
        );
        assert!(unrelated.exists());
        assert_eq!(fs::read_to_string(&unrelated).unwrap(), "must survive");

        let _ = fs::remove_dir_all(&root);
    }
}
