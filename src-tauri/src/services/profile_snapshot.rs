use crate::db::{Database, Phrase, PhraseCategory, QuickAction};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PublicProfile {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

/// Tablet-relevant profile data. Never includes API keys or secrets.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSnapshot {
    pub profile: PublicProfile,
    pub phrases: Vec<Phrase>,
    pub phrase_categories: Vec<PhraseCategory>,
    pub quick_actions: Vec<QuickAction>,
    /// Parsed settings object when valid JSON; otherwise raw string omitted.
    pub settings: serde_json::Value,
}

pub fn build_profile_snapshot(
    db: &Database,
    profile_id: &str,
    language: &str,
) -> Result<ProfileSnapshot, String> {
    let profiles = db.get_profiles().map_err(|e| e.to_string())?;
    let profile = profiles
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("Profile not found: {profile_id}"))?;

    let settings = serde_json::from_str(&profile.settings_json)
        .unwrap_or_else(|_| serde_json::json!({}));

    // Strip any accidentally stored secrets before syncing to tablet.
    let settings = sanitize_settings_for_tablet(settings);

    let phrases = db
        .get_phrases(profile_id, language)
        .map_err(|e| e.to_string())?;
    let phrase_categories = db
        .get_phrase_categories(profile_id)
        .map_err(|e| e.to_string())?;
    let quick_actions = db
        .get_quick_actions(profile_id)
        .map_err(|e| e.to_string())?;

    Ok(ProfileSnapshot {
        profile: PublicProfile { id: profile.id, name: profile.name, created_at: profile.created_at },
        phrases,
        phrase_categories,
        quick_actions,
        settings,
    })
}

fn sanitize_settings_for_tablet(settings: serde_json::Value) -> serde_json::Value {
    // Copy only known, correctly typed preferences. Future host settings remain private.
    let mut public = serde_json::Map::new();
    if let Some(language) = settings.get("typingLanguage").and_then(|v| v.as_str()) {
        public.insert("typingLanguage".into(), language.into());
    }
    for key in ["predictionEnabled", "phrasesVisible", "quickActionsVisible", "mouseVisible"] {
        if let Some(value) = settings.get(key).and_then(|v| v.as_bool()) {
            public.insert(key.into(), value.into());
        }
    }
    serde_json::Value::Object(public)
}
#[cfg(test)]
mod audit_snapshot_regression {
    use super::*;

    #[test]
    fn serialized_tablet_snapshot_contains_no_host_api_key() {
        let root = std::env::temp_dir().join(format!("reachpanel-snapshot-audit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let db = Database::new(root).unwrap();
        db.ensure_internal_profile("active", "Audit", "en").unwrap();
        db.update_profile_settings("active",
            r#"{"uiLanguage":"en","groqApiKey":"AUDIT_SENTINEL_NOT_A_REAL_KEY"}"#).unwrap();
        let snapshot = build_profile_snapshot(&db, "active", "en").unwrap();
        assert!(snapshot.settings.get("groqApiKey").is_none());
        let wire = serde_json::to_string(&snapshot).unwrap();
        assert!(!wire.contains("AUDIT_SENTINEL_NOT_A_REAL_KEY"),
            "Host API key leaked through profile.settings_json despite sanitized settings");
    }
}
