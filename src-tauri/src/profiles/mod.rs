use crate::db::{
    Database, MacroDef, MacroStep, PhraseCategory, PhraseWithLanguage, PredictionEntry, QuickAction,
};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

const ACTIVE_PROFILE_CONFIG: &str = "active_profile.txt";
pub const INTERNAL_PROFILE_ID: &str = "active";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFileInfo {
    pub filename: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFilePhrase {
    pub id: String,
    pub category_id: String,
    pub text: String,
    pub action: String,
    pub is_favorite: bool,
    pub is_emergency: bool,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFileMacroStep {
    pub step_order: i32,
    pub action_type: String,
    pub payload_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFileMacro {
    pub id: String,
    pub name: String,
    pub steps: Vec<ProfileFileMacroStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileFile {
    pub name: String,
    pub settings: serde_json::Value,
    pub quick_actions: Vec<QuickAction>,
    pub phrase_categories: Vec<PhraseCategory>,
    pub phrases: Vec<ProfileFilePhrase>,
    pub macros: Vec<ProfileFileMacro>,
    pub predictions: Vec<PredictionEntry>,
    pub head_tracking_settings: serde_json::Value,
}

pub struct ProfileStore {
    profiles_dir: PathBuf,
    active_filename: Mutex<String>,
}

impl ProfileStore {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let profiles_dir = app_data_dir.join("profiles");
        fs::create_dir_all(&profiles_dir)?;
        let active_filename = Self::read_active_filename(&profiles_dir)?;
        Ok(Self {
            profiles_dir,
            active_filename: Mutex::new(active_filename),
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
        if let Ok(mut guard) = self.active_filename.lock() {
            *guard = filename.to_string();
        }
        Ok(())
    }

    pub fn ensure_default_profile_file(&self, db: &Database) -> Result<String> {
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
            self.write_active_filename(&filename)?;
            self.load_profile_file(db, &filename)?;
            return Ok(filename);
        }

        let filename = "default.profile.json".to_string();
        db.ensure_internal_profile(INTERNAL_PROFILE_ID, "Default")?;
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
        let path = self.profiles_dir.join(filename);
        if !path.exists() {
            return Err(anyhow!("Profile file not found: {filename}"));
        }
        let content = fs::read_to_string(path)?;
        let file: ProfileFile = serde_json::from_str(&content)?;
        import_profile_into_db(db, INTERNAL_PROFILE_ID, &file)?;
        self.write_active_filename(filename)?;
        Ok(())
    }

    pub fn save_active_profile(&self, db: &Database) -> Result<()> {
        let filename = self.active_filename()?;
        if filename.is_empty() {
            return Ok(());
        }
        let file = export_profile_from_db(db, INTERNAL_PROFILE_ID)?;
        let path = self.profiles_dir.join(&filename);
        fs::write(path, serde_json::to_string_pretty(&file)?)?;
        Ok(())
    }

    pub fn create_profile_file(&self, db: &Database, filename: &str, name: &str) -> Result<()> {
        let safe_name = if filename.ends_with(".profile.json") {
            filename.to_string()
        } else {
            format!("{filename}.profile.json")
        };
        let path = self.profiles_dir.join(&safe_name);
        if path.exists() {
            return Err(anyhow!("Profile file already exists"));
        }
        db.reset_profile_to_defaults(INTERNAL_PROFILE_ID, name)?;
        self.write_active_filename(&safe_name)?;
        self.save_active_profile(db)?;
        Ok(())
    }
}

fn export_profile_from_db(db: &Database, profile_id: &str) -> Result<ProfileFile> {
    let profile = db
        .get_profile_by_id(profile_id)?
        .ok_or_else(|| anyhow!("Profile not found"))?;
    let settings: serde_json::Value = serde_json::from_str(&profile.settings_json)?;
    let quick_actions = db.get_quick_actions(profile_id)?;
    let phrase_categories = db.get_phrase_categories(profile_id)?;
    let phrases = db
        .get_all_phrases(profile_id)?
        .into_iter()
        .map(|p| ProfileFilePhrase {
            id: p.id,
            category_id: p.category_id,
            text: p.text,
            action: p.action,
            is_favorite: p.is_favorite,
            is_emergency: p.is_emergency,
            language: p.language,
        })
        .collect();
    let macro_defs = db.get_macros(profile_id)?;
    let mut macros = Vec::new();
    for macro_def in macro_defs {
        let steps = db
            .get_macro_steps(&macro_def.id)?
            .into_iter()
            .map(|s| ProfileFileMacroStep {
                step_order: s.step_order,
                action_type: s.action_type,
                payload_json: s.payload_json,
            })
            .collect();
        macros.push(ProfileFileMacro {
            id: macro_def.id,
            name: macro_def.name,
            steps,
        });
    }
    let predictions = db.get_all_predictions(profile_id)?;
    let head_tracking_settings: serde_json::Value =
        serde_json::from_str(&db.get_head_tracking_settings(profile_id)?)?;
    Ok(ProfileFile {
        name: profile.name,
        settings,
        quick_actions,
        phrase_categories,
        phrases,
        macros,
        predictions,
        head_tracking_settings,
    })
}

fn import_profile_into_db(db: &Database, profile_id: &str, file: &ProfileFile) -> Result<()> {
    db.ensure_internal_profile(profile_id, &file.name)?;
    db.clear_profile_data(profile_id)?;
    db.update_profile_settings(profile_id, &file.settings.to_string())?;

    for action in &file.quick_actions {
        db.save_quick_action(action)?;
    }
    for category in &file.phrase_categories {
        db.save_phrase_category(category)?;
    }
    for phrase in &file.phrases {
        db.insert_phrase_with_language(&PhraseWithLanguage {
            id: phrase.id.clone(),
            profile_id: profile_id.to_string(),
            category_id: phrase.category_id.clone(),
            text: phrase.text.clone(),
            action: phrase.action.clone(),
            is_favorite: phrase.is_favorite,
            is_emergency: phrase.is_emergency,
            language: phrase.language.clone(),
        })?;
    }
    for macro_def in &file.macros {
        let steps: Vec<MacroStep> = macro_def
            .steps
            .iter()
            .map(|s| MacroStep {
                id: Uuid::new_v4().to_string(),
                macro_id: macro_def.id.clone(),
                step_order: s.step_order,
                action_type: s.action_type.clone(),
                payload_json: s.payload_json.clone(),
            })
            .collect();
        db.save_macro(
            &MacroDef {
                id: macro_def.id.clone(),
                profile_id: profile_id.to_string(),
                name: macro_def.name.clone(),
            },
            &steps,
        )?;
    }
    for entry in &file.predictions {
        db.insert_prediction(profile_id, entry)?;
    }
    db.save_head_tracking_settings(
        profile_id,
        &file.head_tracking_settings.to_string(),
    )?;
    Ok(())
}

pub fn pick_image_file() -> Result<Option<String>> {
    let file = rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"])
        .pick_file();
    Ok(file.map(|p| p.to_string_lossy().into_owned()))
}
