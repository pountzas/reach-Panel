use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

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
        "predictionEnabled": false,
        "quickActionsVisible": false,
        "phrasesVisible": false,
        "suggestionsVisible": false,
        "dictationVisible": true,
        "inputPreviewVisible": true,
        "inputPreviewFocusModeVisible": true,
        "taskbarPositionPreference": "bottom",
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
            DROP TABLE IF EXISTS quick_actions;
            DROP TABLE IF EXISTS phrases;
            DROP TABLE IF EXISTS phrase_categories;
            DROP TABLE IF EXISTS macros;
            DROP TABLE IF EXISTS macro_steps;
            DROP TABLE IF EXISTS head_tracking_profiles;
            DROP TABLE IF EXISTS usage_statistics;
            "#,
        )?;
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

    pub fn ensure_internal_profile(&self, id: &str, name: &str, ui_language: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let exists: i64 =
            conn.query_row("SELECT COUNT(*) FROM profiles WHERE id = ?1", [id], |r| {
                r.get(0)
            })?;
        if exists == 0 {
            let now = Utc::now().to_rfc3339();
            let settings = default_settings_json(ui_language);
            conn.execute(
                "INSERT INTO profiles (id, name, settings_json, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, settings.to_string(), now],
            )?;
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
        Ok(())
    }

    pub fn clear_profile_data(&self, profile_id: &str) -> Result<()> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        conn.execute(
            "DELETE FROM predictions WHERE profile_id = ?1",
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
        let mut stmt = conn.prepare(
            "SELECT id, name, settings_json, created_at FROM profiles ORDER BY created_at",
        )?;
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

    pub fn get_predictions(
        &self,
        profile_id: &str,
        prefix: &str,
        language: &str,
        limit: i32,
    ) -> Result<Vec<PredictionEntry>> {
        let conn = self.conn.lock().map_err(|_| anyhow!("DB lock poisoned"))?;
        let pattern = format!("{}%", prefix.to_lowercase());
        let mut pack_freq: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();
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
        let mut stmt =
            conn.prepare("SELECT language, version FROM installed_packs ORDER BY language")?;
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
        tx.execute(
            "DELETE FROM pack_words WHERE language = ?1",
            params![language],
        )?;
        {
            let mut stmt =
                tx.prepare("INSERT INTO pack_words (language, word, frequency) VALUES (?1,?2,?3)")?;
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
        tx.execute(
            "DELETE FROM pack_words WHERE language = ?1",
            params![language],
        )?;
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn migrate_drops_removed_v1_tables() {
        let dir = std::env::temp_dir().join(format!("reach-panel-db-test-{}", Uuid::new_v4()));
        let db = Database::new(dir.clone()).expect("create db");
        {
            let conn = db.conn.lock().expect("lock");
            // Recreate a legacy table to prove migrate drops it.
            conn.execute_batch(
                "CREATE TABLE phrases (id TEXT PRIMARY KEY);
                 CREATE TABLE quick_actions (id TEXT PRIMARY KEY);
                 CREATE TABLE macros (id TEXT PRIMARY KEY);",
            )
            .expect("create legacy tables");
        }
        db.migrate().expect("migrate");
        let conn = db.conn.lock().expect("lock");
        for table in [
            "phrases",
            "quick_actions",
            "phrase_categories",
            "macros",
            "macro_steps",
            "head_tracking_profiles",
            "usage_statistics",
        ] {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    params![table],
                    |r| r.get(0),
                )
                .expect("check table");
            assert_eq!(exists, 0, "expected {table} to be dropped");
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
