use crate::db::{Database, Phrase, PhraseCategory, Profile, QuickAction};
use serde::Serialize;

/// Tablet-relevant profile data. Never includes API keys or secrets.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSnapshot {
    pub profile: Profile,
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
        profile,
        phrases,
        phrase_categories,
        quick_actions,
        settings,
    })
}

fn sanitize_settings_for_tablet(mut settings: serde_json::Value) -> serde_json::Value {
    const REDACT_KEYS: &[&str] = &[
        "groqApiKey",
        "groq_api_key",
        "apiKey",
        "api_key",
        "openaiApiKey",
        "secret",
        "token",
    ];
    if let Some(obj) = settings.as_object_mut() {
        for key in REDACT_KEYS {
            obj.remove(*key);
        }
    }
    settings
}
