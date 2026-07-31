use crate::db::{Database, PredictionEntry};
use anyhow::Result;

pub fn get_suggestions(
    db: &Database,
    profile_id: &str,
    prefix: &str,
    language: &str,
    limit: i32,
) -> Result<Vec<PredictionEntry>> {
    if prefix.trim().is_empty() {
        return Ok(vec![]);
    }
    db.get_predictions(profile_id, &prefix.to_lowercase(), language, limit)
}

pub fn record_usage(db: &Database, profile_id: &str, word: &str, language: &str) -> Result<()> {
    db.record_word_usage(profile_id, &word.to_lowercase(), language)
}

pub fn get_installed_languages() -> Vec<String> {
    crate::input::get_installed_language_tags()
}
