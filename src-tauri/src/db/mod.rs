use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
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

fn default_settings_json(ui_language: &str) -> serde_json::Value {
    serde_json::json!({
        "colorProfile": "dark-grey",
        "opacity": 0.95,
        "uiLanguage": ui_language,
        "typingLanguage": "en",
        "mouseVisible": true,
        "mousePanelMode": "mouse",
        "mousePanelSide": "right",
        "keyboardFontSize": 18,
        "sectionLayouts": {},
        "backgroundImageOpacity": 0.35,
        "mouseSpeed": "medium",
        "precisionMode": false,
        "predictionEnabled": false,
        "quickActionsVisible": false,
        "phrasesVisible": false,
        "suggestionsVisible": false,
        "dictationVisible": false,
        "emergencyVisible": false,
        "accessibilityMonitorId": 0,
        "collapsed": false,
        "headTrackingEnabled": false,
        "mouseAutoHide": false,
        "fnKeyMode": "one-shot",
        "keyboardSectionMode": "keyboard",
        "keyboardModeToggleVisible": false,
        "synthesizerVolume": 70,
        "synthesizerMuted": false,
        "synthesizerOctaveCount": 2,
        "synthesizerStartOctave": 3,
        "inputRowRightRatio": 0.28,
        "inputAreaCompact": false,
        "mouseBottomRowVisible": true,
        "largeHeaders": false
    })
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&app_data_dir)?;
        let db_path = Self::resolve_db_path(&app_data_dir)?;
        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        db.seed_if_empty()?;
        Ok(db)
    }

    fn resolve_db_path(app_data_dir: &PathBuf) -> Result<PathBuf> {
        const DB_FILE: &str = "reach-panel.db";
        const LEGACY_DB_FILE: &str = "accessibility-keyboard.db";

        let db_path = app_data_dir.join(DB_FILE);
        let legacy_path = app_data_dir.join(LEGACY_DB_FILE);

        if !db_path.exists() && legacy_path.exists() {
            std::fs::rename(&legacy_path, &db_path)?;
        } else if db_path.exists() && legacy_path.exists() {
            eprintln!(
                "Both {DB_FILE} and {LEGACY_DB_FILE} exist in {}; using {DB_FILE} and leaving the legacy database untouched.",
                app_data_dir.display()
            );
        }

        Ok(db_path)
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
            CREATE TABLE IF NOT EXISTS pack_words (
                language TEXT NOT NULL,
                word TEXT NOT NULL,
                frequency INTEGER NOT NULL,
                PRIMARY KEY (language, word)
            );
            CREATE TABLE IF NOT EXISTS installed_packs (
                language TEXT PRIMARY KEY,
                version INTEGER NOT NULL,
                installed_at TEXT NOT NULL
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
            for (language, phrases) in Self::locale_seed_phrases() {
                self.seed_locale_phrases_if_missing(conn, &profile_id, language, phrases)?;
            }
        }
        Ok(())
    }

    /// Default phrase packs for non-English UI locales (same 6-intent matrix as English).
    fn locale_seed_phrases() -> &'static [(&'static str, &'static [(&'static str, &'static str, bool, bool)])]
    {
        &[
            (
                "el",
                &[
                    ("Χρειάζομαι βοήθεια", "both", false, true),
                    ("Χρειάζομαι νερό", "both", true, false),
                    ("Κουράστηκα", "speak", false, false),
                    ("Ευχαριστώ", "speak", true, false),
                    ("Πονάω", "both", false, true),
                    ("Έλα εδώ παρακαλώ", "both", false, true),
                ],
            ),
            (
                "de",
                &[
                    ("Ich brauche Hilfe", "both", false, true),
                    ("Ich brauche Wasser", "both", true, false),
                    ("Ich bin müde", "speak", false, false),
                    ("Danke", "speak", true, false),
                    ("Ich habe Schmerzen", "both", false, true),
                    ("Komm bitte her", "both", false, true),
                ],
            ),
            (
                "fr",
                &[
                    ("J’ai besoin d’aide", "both", false, true),
                    ("J’ai besoin d’eau", "both", true, false),
                    ("Je suis fatigué", "speak", false, false),
                    ("Merci", "speak", true, false),
                    ("J’ai mal", "both", false, true),
                    ("Viens ici s’il te plaît", "both", false, true),
                ],
            ),
            (
                "it",
                &[
                    ("Ho bisogno di aiuto", "both", false, true),
                    ("Ho bisogno di acqua", "both", true, false),
                    ("Sono stanco", "speak", false, false),
                    ("Grazie", "speak", true, false),
                    ("Ho dolore", "both", false, true),
                    ("Vieni qui per favore", "both", false, true),
                ],
            ),
            (
                "es",
                &[
                    ("Necesito ayuda", "both", false, true),
                    ("Necesito agua", "both", true, false),
                    ("Estoy cansado", "speak", false, false),
                    ("Gracias", "speak", true, false),
                    ("Me duele", "both", false, true),
                    ("Ven aquí por favor", "both", false, true),
                ],
            ),
            (
                "pt",
                &[
                    ("Preciso de ajuda", "both", false, true),
                    ("Preciso de água", "both", true, false),
                    ("Estou cansado", "speak", false, false),
                    ("Obrigado", "speak", true, false),
                    ("Estou com dor", "both", false, true),
                    ("Vem cá por favor", "both", false, true),
                ],
            ),
        ]
    }

    fn seed_locale_phrases_if_missing(
        &self,
        conn: &Connection,
        profile_id: &str,
        language: &str,
        phrases: &[(&str, &str, bool, bool)],
    ) -> Result<()> {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM phrases WHERE profile_id = ?1 AND language = ?2",
            params![profile_id, language],
            |r| r.get(0),
        )?;
        if count > 0 {
            return Ok(());
        }

        let (basic_cat, emergency_cat) = self.ensure_phrase_category_ids(conn, profile_id)?;

        for (text, action, fav, emergency) in phrases {
            let category = if *emergency {
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
                    *fav as i32,
                    *emergency as i32,
                    language
                ],
            )?;
        }
        Ok(())
    }

    /// Profiles can exist without phrase categories (partial seed / older data).
    /// Create Basic Needs (0) and Emergency (1) when missing so locale seeding cannot panic.
    fn ensure_phrase_category_ids(
        &self,
        conn: &Connection,
        profile_id: &str,
    ) -> Result<(String, String)> {
        let basic_cat: Option<String> = conn
            .query_row(
                "SELECT id FROM phrase_categories WHERE profile_id = ?1 AND sort_order = 0 LIMIT 1",
                [profile_id],
                |r| r.get(0),
            )
            .optional()?;
        let emergency_cat: Option<String> = conn
            .query_row(
                "SELECT id FROM phrase_categories WHERE profile_id = ?1 AND sort_order = 1 LIMIT 1",
                [profile_id],
                |r| r.get(0),
            )
            .optional()?;

        let basic_cat = match basic_cat {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO phrase_categories (id, profile_id, name, sort_order) VALUES (?1,?2,?3,?4)",
                    params![id, profile_id, "Basic Needs", 0],
                )?;
                id
            }
        };
        let emergency_cat = match emergency_cat {
            Some(id) => id,
            None => {
                let id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO phrase_categories (id, profile_id, name, sort_order) VALUES (?1,?2,?3,?4)",
                    params![id, profile_id, "Emergency", 1],
                )?;
                id
            }
        };
        Ok((basic_cat, emergency_cat))
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

        for (language, phrases) in Self::locale_seed_phrases() {
            for (text, action, fav, emergency) in *phrases {
                let category = if *emergency { &emergency_cat } else { &cat_id };
                conn.execute(
                    "INSERT INTO phrases (id, profile_id, category_id, text, action, is_favorite, is_emergency, language) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![
                        Uuid::new_v4().to_string(),
                        profile_id,
                        category,
                        *text,
                        *action,
                        *fav as i32,
                        *emergency as i32,
                        language
                    ],
                )?;
            }
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

    pub fn ensure_internal_profile(
        &self,
        id: &str,
        name: &str,
        ui_language: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM profiles WHERE id = ?1",
            [id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            let now = Utc::now().to_rfc3339();
            let settings = default_settings_json(ui_language);
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

    pub fn reset_profile_to_defaults(
        &self,
        profile_id: &str,
        name: &str,
        ui_language: &str,
    ) -> Result<()> {
        self.clear_profile_data(profile_id)?;
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let settings = default_settings_json(ui_language);
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
        let word = entry.word.to_lowercase();
        conn.execute(
            "INSERT INTO predictions (profile_id, word, language, frequency) VALUES (?1,?2,?3,?4)",
            params![profile_id, word, entry.language, entry.frequency],
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
        let pattern = format!("{}%", prefix.to_lowercase());
        let mut pack_freq: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        let mut profile_usage: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();

        {
            let mut stmt = conn.prepare(
                "SELECT word, frequency FROM pack_words WHERE language = ?1 AND word LIKE ?2",
            )?;
            let rows = stmt.query_map(params![language, pattern], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })?;
            for row in rows {
                let (word, freq) = row?;
                pack_freq.insert(word, i64::from(freq));
            }
        }

        {
            let mut stmt = conn.prepare(
                "SELECT word, frequency FROM predictions WHERE profile_id = ?1 AND language = ?2 AND word LIKE ?3",
            )?;
            let rows = stmt.query_map(params![profile_id, language, pattern], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })?;
            for row in rows {
                let (word, freq) = row?;
                profile_usage.insert(word, i64::from(freq));
            }
        }

        let mut ranked: Vec<(String, i64, i64)> = pack_freq
            .keys()
            .chain(profile_usage.keys())
            .cloned()
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .map(|word| {
                let usage = profile_usage.get(&word).copied().unwrap_or(0);
                let pack = pack_freq.get(&word).copied().unwrap_or(0);
                (word, usage, pack)
            })
            .collect();
        ranked.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| b.2.cmp(&a.2))
                .then_with(|| a.0.cmp(&b.0))
        });
        ranked.truncate(limit.max(0) as usize);

        Ok(ranked
            .into_iter()
            .map(|(word, usage, pack)| PredictionEntry {
                word,
                language: language.to_string(),
                frequency: (usage.saturating_mul(1000).saturating_add(pack))
                    .min(i64::from(i32::MAX)) as i32,
            })
            .collect())
    }

    pub fn list_installed_packs(&self) -> Result<Vec<(String, i32)>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT language, version FROM installed_packs ORDER BY language",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn is_pack_installed(&self, language: &str) -> Result<bool> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM installed_packs WHERE language = ?1",
            params![language],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn import_word_pack(
        &self,
        language: &str,
        version: i32,
        words: &[(String, i32)],
    ) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM pack_words WHERE language = ?1", params![language])?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO pack_words (language, word, frequency) VALUES (?1,?2,?3)",
            )?;
            for (word, freq) in words {
                stmt.execute(params![language, word, freq])?;
            }
        }
        tx.execute(
            "INSERT INTO installed_packs (language, version, installed_at) VALUES (?1,?2,?3)
             ON CONFLICT(language) DO UPDATE SET version = excluded.version, installed_at = excluded.installed_at",
            params![language, version, Utc::now().to_rfc3339()],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn uninstall_word_pack(&self, language: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM pack_words WHERE language = ?1", params![language])?;
        tx.execute(
            "DELETE FROM installed_packs WHERE language = ?1",
            params![language],
        )?;
        tx.commit()?;
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_locale_phrases_tolerates_profile_without_categories() {
        let dir = std::env::temp_dir().join(format!("reach-panel-db-test-{}", Uuid::new_v4()));
        let db = Database::new(dir.clone()).expect("create db");
        {
            let conn = db.conn.lock().expect("lock");
            conn.execute(
                "INSERT INTO profiles (id, name, settings_json, created_at) VALUES (?1,?2,?3,?4)",
                params![
                    "orphan",
                    "Orphan",
                    "{}",
                    "2020-01-01T00:00:00Z"
                ],
            )
            .expect("insert orphan profile");
        }
        db.migrate()
            .expect("migrate must not panic when categories are missing");
        let conn = db.conn.lock().expect("lock");
        let cats: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM phrase_categories WHERE profile_id = 'orphan'",
                [],
                |r| r.get(0),
            )
            .expect("count categories");
        assert!(cats >= 2, "expected Basic Needs + Emergency categories");
        let phrases: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM phrases WHERE profile_id = 'orphan' AND language = 'el'",
                [],
                |r| r.get(0),
            )
            .expect("count phrases");
        assert!(phrases > 0, "expected locale phrases to be seeded");
        let _ = std::fs::remove_dir_all(dir);
    }
}
