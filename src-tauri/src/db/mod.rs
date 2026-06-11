use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub settings_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAction {
    pub id: String,
    pub profile_id: String,
    pub label: String,
    pub target: String,
    pub action_type: String,
    pub category: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhraseCategory {
    pub id: String,
    pub profile_id: String,
    pub name: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Phrase {
    pub id: String,
    pub profile_id: String,
    pub category_id: String,
    pub text: String,
    pub action: String,
    pub is_favorite: bool,
    pub is_emergency: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhraseWithLanguage {
    pub id: String,
    pub profile_id: String,
    pub category_id: String,
    pub text: String,
    pub action: String,
    pub is_favorite: bool,
    pub is_emergency: bool,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroDef {
    pub id: String,
    pub profile_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroStep {
    pub id: String,
    pub macro_id: String,
    pub step_order: i32,
    pub action_type: String,
    pub payload_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictionEntry {
    pub word: String,
    pub language: String,
    pub frequency: i32,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir)?;
        let db_path = app_data_dir.join("accessibility-keyboard.db");
        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                settings_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS quick_actions (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                label TEXT NOT NULL,
                target TEXT NOT NULL,
                action_type TEXT NOT NULL,
                category TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS phrase_categories (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS phrases (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                text TEXT NOT NULL,
                action TEXT NOT NULL,
                is_favorite INTEGER NOT NULL,
                is_emergency INTEGER NOT NULL,
                language TEXT NOT NULL DEFAULT 'en'
            );
            CREATE TABLE IF NOT EXISTS macros (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                name TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS macro_steps (
                id TEXT PRIMARY KEY,
                macro_id TEXT NOT NULL,
                step_order INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id TEXT NOT NULL,
                word TEXT NOT NULL,
                language TEXT NOT NULL,
                frequency INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS usage_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS head_tracking_profiles (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                settings_json TEXT NOT NULL
            );
            "#,
        )?;
        self.migrate_phrases_language(&conn)?;
        Ok(())
    }

    fn migrate_phrases_language(&self, conn: &Connection) -> Result<()> {
        let has_language: bool = conn
            .prepare("PRAGMA table_info(phrases)")?
            .query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name == "language")
            })?
            .filter_map(Result::ok)
            .any(|v| v);

        if !has_language {
            conn.execute(
                "ALTER TABLE phrases ADD COLUMN language TEXT NOT NULL DEFAULT 'en'",
                [],
            )?;
        }

        let profile_ids: Vec<String> = conn
            .prepare("SELECT id FROM profiles")?
            .query_map([], |row| row.get(0))?
            .filter_map(Result::ok)
            .collect();

        for profile_id in profile_ids {
            self.seed_greek_phrases_if_missing(conn, &profile_id)?;
        }
        Ok(())
    }

    fn seed_greek_phrases_if_missing(&self, conn: &Connection, profile_id: &str) -> Result<()> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM phrases WHERE profile_id = ?1 AND language = 'el'",
            [profile_id],
            |r| r.get(0),
        )?;
        if count > 0 {
            return Ok(());
        }

        let basic_cat: String = conn.query_row(
            "SELECT id FROM phrase_categories WHERE profile_id = ?1 AND sort_order = 0 LIMIT 1",
            [profile_id],
            |r| r.get(0),
        )?;
        let emergency_cat: String = conn.query_row(
            "SELECT id FROM phrase_categories WHERE profile_id = ?1 AND sort_order = 1 LIMIT 1",
            [profile_id],
            |r| r.get(0),
        )?;

        let phrases = [
            ("Χρειάζομαι βοήθεια", "both", false, true),
            ("Χρειάζομαι νερό", "both", true, false),
            ("Κουράστηκα", "speak", false, false),
            ("Ευχαριστώ", "speak", true, false),
            ("Πονάω", "both", false, true),
            ("Έλα εδώ παρακαλώ", "both", false, true),
        ];
        for (text, action, fav, emergency) in phrases {
            let category = if emergency {
                &emergency_cat
            } else {
                &basic_cat
            };
            conn.execute(
                "INSERT INTO phrases (id, profile_id, category_id, text, action, is_favorite, is_emergency, language) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    Uuid::new_v4().to_string(),
                    profile_id,
                    category,
                    text,
                    action,
                    fav as i32,
                    emergency as i32,
                    "el"
                ],
            )?;
        }
        Ok(())
    }

    fn seed_if_empty(&self) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
        if count > 0 {
            return Ok(());
        }
        // Profile content is loaded from file-based profiles on startup.
        Ok(())
    }

    fn seed_profile_data(&self, conn: &Connection, profile_id: &str) -> Result<()> {
        let quick_actions = [
            ("Chrome", "chrome", "app", "Utilities", 0),
            ("YouTube", "https://youtube.com", "url", "Entertainment", 1),
            ("Teams", "msteams", "app", "Communication", 2),
            ("Spotify", "spotify", "app", "Entertainment", 3),
        ];
        for (label, target, action_type, category, sort) in quick_actions {
            conn.execute(
                "INSERT INTO quick_actions (id, profile_id, label, target, action_type, category, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![Uuid::new_v4().to_string(), profile_id, label, target, action_type, category, sort],
            )?;
        }

        let cat_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO phrase_categories (id, profile_id, name, sort_order) VALUES (?1,?2,?3,?4)",
            params![cat_id, profile_id, "Basic Needs", 0],
        )?;

        let emergency_cat = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO phrase_categories (id, profile_id, name, sort_order) VALUES (?1,?2,?3,?4)",
            params![emergency_cat, profile_id, "Emergency", 1],
        )?;

        let phrases = [
            ("I need help", "both", false, true),
            ("I need water", "both", true, false),
            ("I am tired", "speak", false, false),
            ("Thank you", "speak", true, false),
            ("I am in pain", "both", false, true),
            ("Come here please", "both", false, true),
        ];
        for (text, action, fav, emergency) in phrases {
            let category = if emergency { &emergency_cat } else { &cat_id };
            conn.execute(
                "INSERT INTO phrases (id, profile_id, category_id, text, action, is_favorite, is_emergency, language) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    Uuid::new_v4().to_string(),
                    profile_id,
                    category,
                    text,
                    action,
                    fav as i32,
                    emergency as i32,
                    "en"
                ],
            )?;
        }

        let greek_phrases = [
            ("Χρειάζομαι βοήθεια", "both", false, true),
            ("Χρειάζομαι νερό", "both", true, false),
            ("Κουράστηκα", "speak", false, false),
            ("Ευχαριστώ", "speak", true, false),
            ("Πονάω", "both", false, true),
            ("Έλα εδώ παρακαλώ", "both", false, true),
        ];
        for (text, action, fav, emergency) in greek_phrases {
            let category = if emergency { &emergency_cat } else { &cat_id };
            conn.execute(
                "INSERT INTO phrases (id, profile_id, category_id, text, action, is_favorite, is_emergency, language) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    Uuid::new_v4().to_string(),
                    profile_id,
                    category,
                    text,
                    action,
                    fav as i32,
                    emergency as i32,
                    "el"
                ],
            )?;
        }

        let words = [
            ("hello", "en", 100),
            ("help", "en", 90),
            ("helicopter", "en", 10),
            ("water", "en", 80),
            ("thank", "en", 70),
            ("thanks", "en", 65),
            ("please", "en", 60),
            ("γεια", "el", 100),
            ("βοήθεια", "el", 90),
            ("νερό", "el", 80),
        ];
        for (word, lang, freq) in words {
            conn.execute(
                "INSERT INTO predictions (profile_id, word, language, frequency) VALUES (?1,?2,?3,?4)",
                params![profile_id, word, lang, freq],
            )?;
        }

        let macro_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO macros (id, profile_id, name) VALUES (?1,?2,?3)",
            params![macro_id, profile_id, "Open YouTube"],
        )?;
        let steps = [
            ("open_program", r#"{"target":"chrome"}"#),
            ("wait", r#"{"ms":2000}"#),
            ("open_url", r#"{"url":"https://youtube.com"}"#),
            ("speak", r#"{"text":"Opening YouTube"}"#),
        ];
        for (i, (action_type, payload)) in steps.iter().enumerate() {
            conn.execute(
                "INSERT INTO macro_steps (id, macro_id, step_order, action_type, payload_json) VALUES (?1,?2,?3,?4,?5)",
                params![Uuid::new_v4().to_string(), macro_id, i as i32, action_type, payload],
            )?;
        }

        conn.execute(
            "INSERT INTO head_tracking_profiles (id, profile_id, settings_json) VALUES (?1,?2,?3)",
            params![
                Uuid::new_v4().to_string(),
                profile_id,
                r#"{"sensitivity":5,"deadZone":0.02,"acceleration":1.5,"smoothing":0.3,"calibrated":false}"#
            ],
        )?;

        Ok(())
    }

    pub fn ensure_internal_profile(&self, id: &str, name: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM profiles WHERE id = ?1",
            [id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            let now = Utc::now().to_rfc3339();
            let settings = serde_json::json!({
                "theme": "light",
                "opacity": 0.95,
                "language": "en",
                "mouseSide": "right",
                "mouseVisible": true,
                "mousePanelWidth": 280,
                "keyboardKeySize": 56,
                "keyboardSpacing": 6,
                "mouseSpeed": "medium",
                "precisionMode": false,
                "predictionEnabled": true,
                "quickActionsVisible": true,
                "phrasesVisible": true,
                "suggestionsVisible": true,
                "emergencyVisible": true,
                "accessibilityMonitorId": 0,
                "collapsed": false,
                "headTrackingEnabled": false
            });
            conn.execute(
                "INSERT INTO profiles (id, name, settings_json, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, settings.to_string(), now],
            )?;
            self.seed_profile_data(&conn, id)?;
        } else {
            conn.execute(
                "UPDATE profiles SET name = ?1 WHERE id = ?2",
                params![name, id],
            )?;
        }
        Ok(())
    }

    pub fn reset_profile_to_defaults(&self, profile_id: &str, name: &str) -> Result<()> {
        self.clear_profile_data(profile_id)?;
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let settings = serde_json::json!({
            "theme": "light",
            "opacity": 0.95,
            "language": "en",
            "mouseSide": "right",
            "mouseVisible": true,
            "mousePanelWidth": 280,
            "keyboardKeySize": 56,
            "keyboardSpacing": 6,
            "mouseSpeed": "medium",
            "precisionMode": false,
            "predictionEnabled": true,
            "quickActionsVisible": true,
            "phrasesVisible": true,
            "suggestionsVisible": true,
            "emergencyVisible": true,
            "accessibilityMonitorId": 0,
            "collapsed": false,
            "headTrackingEnabled": false
        });
        conn.execute(
            "UPDATE profiles SET name = ?1, settings_json = ?2 WHERE id = ?3",
            params![name, settings.to_string(), profile_id],
        )?;
        self.seed_profile_data(&conn, profile_id)?;
        Ok(())
    }

    pub fn clear_profile_data(&self, profile_id: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let macro_ids: Vec<String> = conn
            .prepare("SELECT id FROM macros WHERE profile_id = ?1")?
            .query_map([profile_id], |row| row.get(0))?
            .filter_map(Result::ok)
            .collect();
        for macro_id in macro_ids {
            conn.execute("DELETE FROM macro_steps WHERE macro_id = ?1", params![macro_id])?;
        }
        conn.execute("DELETE FROM quick_actions WHERE profile_id = ?1", params![profile_id])?;
        conn.execute("DELETE FROM phrases WHERE profile_id = ?1", params![profile_id])?;
        conn.execute(
            "DELETE FROM phrase_categories WHERE profile_id = ?1",
            params![profile_id],
        )?;
        conn.execute("DELETE FROM macros WHERE profile_id = ?1", params![profile_id])?;
        conn.execute("DELETE FROM predictions WHERE profile_id = ?1", params![profile_id])?;
        conn.execute(
            "DELETE FROM head_tracking_profiles WHERE profile_id = ?1",
            params![profile_id],
        )?;
        Ok(())
    }

    pub fn get_profile_by_id(&self, id: &str) -> Result<Option<Profile>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt =
            conn.prepare("SELECT id, name, settings_json, created_at FROM profiles WHERE id = ?1")?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Profile {
                id: row.get(0)?,
                name: row.get(1)?,
                settings_json: row.get(2)?,
                created_at: row.get(3)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_phrases(&self, profile_id: &str) -> Result<Vec<PhraseWithLanguage>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT id, profile_id, category_id, text, action, is_favorite, is_emergency, language FROM phrases WHERE profile_id = ?1",
        )?;
        let rows = stmt.query_map([profile_id], |row| {
            Ok(PhraseWithLanguage {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                category_id: row.get(2)?,
                text: row.get(3)?,
                action: row.get(4)?,
                is_favorite: row.get::<_, i32>(5)? != 0,
                is_emergency: row.get::<_, i32>(6)? != 0,
                language: row.get(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_all_predictions(&self, profile_id: &str) -> Result<Vec<PredictionEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT word, language, frequency FROM predictions WHERE profile_id = ?1 ORDER BY frequency DESC",
        )?;
        let rows = stmt.query_map([profile_id], |row| {
            Ok(PredictionEntry {
                word: row.get(0)?,
                language: row.get(1)?,
                frequency: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn insert_phrase_with_language(&self, phrase: &PhraseWithLanguage) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "INSERT INTO phrases (id, profile_id, category_id, text, action, is_favorite, is_emergency, language) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                phrase.id,
                phrase.profile_id,
                phrase.category_id,
                phrase.text,
                phrase.action,
                phrase.is_favorite as i32,
                phrase.is_emergency as i32,
                phrase.language
            ],
        )?;
        Ok(())
    }

    pub fn insert_prediction(&self, profile_id: &str, entry: &PredictionEntry) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "INSERT INTO predictions (profile_id, word, language, frequency) VALUES (?1,?2,?3,?4)",
            params![profile_id, entry.word, entry.language, entry.frequency],
        )?;
        Ok(())
    }

    pub fn get_profiles(&self) -> Result<Vec<Profile>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare("SELECT id, name, settings_json, created_at FROM profiles ORDER BY created_at")?;
        let rows = stmt.query_map([], |row| {
            Ok(Profile {
                id: row.get(0)?,
                name: row.get(1)?,
                settings_json: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_profile_settings(&self, id: &str, settings_json: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "UPDATE profiles SET settings_json = ?1 WHERE id = ?2",
            params![settings_json, id],
        )?;
        Ok(())
    }

    pub fn get_quick_actions(&self, profile_id: &str) -> Result<Vec<QuickAction>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT id, profile_id, label, target, action_type, category, sort_order FROM quick_actions WHERE profile_id = ?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([profile_id], |row| {
            Ok(QuickAction {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                label: row.get(2)?,
                target: row.get(3)?,
                action_type: row.get(4)?,
                category: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn save_quick_action(&self, action: &QuickAction) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "INSERT OR REPLACE INTO quick_actions (id, profile_id, label, target, action_type, category, sort_order) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![action.id, action.profile_id, action.label, action.target, action.action_type, action.category, action.sort_order],
        )?;
        Ok(())
    }

    pub fn delete_quick_action(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute("DELETE FROM quick_actions WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_phrases(&self, profile_id: &str, language: &str) -> Result<Vec<Phrase>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT id, profile_id, category_id, text, action, is_favorite, is_emergency FROM phrases WHERE profile_id = ?1 AND language = ?2",
        )?;
        let rows = stmt.query_map(params![profile_id, language], |row| {
            Ok(Phrase {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                category_id: row.get(2)?,
                text: row.get(3)?,
                action: row.get(4)?,
                is_favorite: row.get::<_, i32>(5)? != 0,
                is_emergency: row.get::<_, i32>(6)? != 0,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn save_phrase_category(&self, category: &PhraseCategory) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "INSERT OR REPLACE INTO phrase_categories (id, profile_id, name, sort_order) VALUES (?1,?2,?3,?4)",
            params![category.id, category.profile_id, category.name, category.sort_order],
        )?;
        Ok(())
    }

    pub fn get_phrase_categories(&self, profile_id: &str) -> Result<Vec<PhraseCategory>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT id, profile_id, name, sort_order FROM phrase_categories WHERE profile_id = ?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([profile_id], |row| {
            Ok(PhraseCategory {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_macro_by_id(&self, id: &str) -> Result<Option<MacroDef>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare("SELECT id, profile_id, name FROM macros WHERE id = ?1")?;
        let mut rows = stmt.query([id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(MacroDef {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_macros(&self, profile_id: &str) -> Result<Vec<MacroDef>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare("SELECT id, profile_id, name FROM macros WHERE profile_id = ?1")?;
        let rows = stmt.query_map([profile_id], |row| {
            Ok(MacroDef {
                id: row.get(0)?,
                profile_id: row.get(1)?,
                name: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_macro_steps(&self, macro_id: &str) -> Result<Vec<MacroStep>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT id, macro_id, step_order, action_type, payload_json FROM macro_steps WHERE macro_id = ?1 ORDER BY step_order",
        )?;
        let rows = stmt.query_map([macro_id], |row| {
            Ok(MacroStep {
                id: row.get(0)?,
                macro_id: row.get(1)?,
                step_order: row.get(2)?,
                action_type: row.get(3)?,
                payload_json: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn save_macro(&self, macro_def: &MacroDef, steps: &[MacroStep]) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "INSERT OR REPLACE INTO macros (id, profile_id, name) VALUES (?1,?2,?3)",
            params![macro_def.id, macro_def.profile_id, macro_def.name],
        )?;
        conn.execute("DELETE FROM macro_steps WHERE macro_id = ?1", params![macro_def.id])?;
        for step in steps {
            conn.execute(
                "INSERT INTO macro_steps (id, macro_id, step_order, action_type, payload_json) VALUES (?1,?2,?3,?4,?5)",
                params![step.id, step.macro_id, step.step_order, step.action_type, step.payload_json],
            )?;
        }
        Ok(())
    }

    pub fn delete_macro(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute("DELETE FROM macro_steps WHERE macro_id = ?1", params![id])?;
        conn.execute("DELETE FROM macros WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_predictions(&self, profile_id: &str, prefix: &str, language: &str, limit: i32) -> Result<Vec<PredictionEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let pattern = format!("{prefix}%");
        let mut stmt = conn.prepare(
            "SELECT word, language, frequency FROM predictions WHERE profile_id = ?1 AND language = ?2 AND word LIKE ?3 ORDER BY frequency DESC LIMIT ?4",
        )?;
        let rows = stmt.query_map(params![profile_id, language, pattern, limit], |row| {
            Ok(PredictionEntry {
                word: row.get(0)?,
                language: row.get(1)?,
                frequency: row.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn record_word_usage(&self, profile_id: &str, word: &str, language: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let updated = conn.execute(
            "UPDATE predictions SET frequency = frequency + 1 WHERE profile_id = ?1 AND word = ?2 AND language = ?3",
            params![profile_id, word, language],
        )?;
        if updated == 0 {
            conn.execute(
                "INSERT INTO predictions (profile_id, word, language, frequency) VALUES (?1,?2,?3,1)",
                params![profile_id, word, language],
            )?;
        }
        Ok(())
    }

    pub fn get_head_tracking_settings(&self, profile_id: &str) -> Result<String> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let result: Result<String, _> = conn.query_row(
            "SELECT settings_json FROM head_tracking_profiles WHERE profile_id = ?1",
            [profile_id],
            |row| row.get(0),
        );
        match result {
            Ok(s) => Ok(s),
            Err(_) => Ok(serde_json::json!({
                "sensitivity": 5,
                "deadZone": 0.02,
                "acceleration": 1.5,
                "smoothing": 0.3,
                "calibrated": false
            }).to_string()),
        }
    }

    pub fn save_head_tracking_settings(&self, profile_id: &str, settings_json: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR REPLACE INTO head_tracking_profiles (id, profile_id, settings_json) VALUES (?1,?2,?3)",
            params![id, profile_id, settings_json],
        )?;
        Ok(())
    }
}
