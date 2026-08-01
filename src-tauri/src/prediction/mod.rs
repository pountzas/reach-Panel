use crate::db::{Database, PredictionEntry};
use anyhow::{anyhow, Result};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const SUPPORTED_PACK_LANGUAGES: &[&str] = &["en", "el", "de", "fr", "it", "es", "pt"];
const PACK_DOWNLOAD_BASE: &str =
    "https://github.com/pountzas/reach-Panel/releases/download/wordpacks-v1";

#[derive(Debug, Clone, serde::Serialize, Deserialize)]
pub struct WordPackInfo {
    pub language: String,
    pub installed: bool,
    pub version: Option<i32>,
    pub bundled: bool,
}

#[derive(Debug, Deserialize)]
struct WordPackFile {
    language: String,
    version: i32,
    words: Vec<(String, i32)>,
}

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

pub fn list_word_packs(db: &Database) -> Result<Vec<WordPackInfo>> {
    let installed = db.list_installed_packs()?;
    let installed_map: std::collections::HashMap<String, i32> = installed.into_iter().collect();
    Ok(SUPPORTED_PACK_LANGUAGES
        .iter()
        .map(|lang| WordPackInfo {
            language: (*lang).to_string(),
            installed: installed_map.contains_key(*lang),
            version: installed_map.get(*lang).copied(),
            bundled: *lang == "en",
        })
        .collect())
}

pub fn ensure_english_pack(app: &AppHandle, db: &Database) -> Result<()> {
    if db.is_pack_installed("en")? {
        return Ok(());
    }
    install_word_pack(app, db, "en")
}

pub fn install_word_pack(app: &AppHandle, db: &Database, language: &str) -> Result<()> {
    validate_language(language)?;
    let pack = if language == "en" {
        load_bundled_english_pack(app)?
    } else {
        download_pack(app, language)?
    };
    if pack.language != language {
        return Err(anyhow!(
            "Pack language mismatch: expected {language}, got {}",
            pack.language
        ));
    }
    db.import_word_pack(&pack.language, pack.version, &pack.words)?;
    Ok(())
}

pub fn uninstall_word_pack(db: &Database, language: &str) -> Result<()> {
    validate_language(language)?;
    if language == "en" {
        return Err(anyhow!("English dictionary is required and cannot be removed"));
    }
    db.uninstall_word_pack(language)?;
    Ok(())
}

fn validate_language(language: &str) -> Result<()> {
    if SUPPORTED_PACK_LANGUAGES.contains(&language) {
        Ok(())
    } else {
        Err(anyhow!("Unsupported prediction language: {language}"))
    }
}

fn load_bundled_english_pack(app: &AppHandle) -> Result<WordPackFile> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources/wordpacks/en.json"));
        candidates.push(resource_dir.join("wordpacks/en.json"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/wordpacks/en.json"));

    for path in &candidates {
        if path.is_file() {
            return read_pack_file(path);
        }
    }
    Err(anyhow!(
        "Bundled English word pack not found (looked in resource dir and src-tauri/resources)"
    ))
}

fn download_pack(app: &AppHandle, language: &str) -> Result<WordPackFile> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!("app data dir: {e}"))?;
    let dir = app_data.join("wordpacks");
    fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("{language}.json"));

    if dest.is_file() {
        if let Ok(pack) = read_pack_file(&dest) {
            if pack.language == language {
                return Ok(pack);
            }
        }
    }

    // Dev convenience: install from local wordpacks-dist without network.
    let local_dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("wordpacks-dist")
        .join(format!("{language}.json"));
    if local_dist.is_file() {
        fs::copy(&local_dist, &dest)?;
        return read_pack_file(&dest);
    }

    let url = format!("{PACK_DOWNLOAD_BASE}/{language}.json");
    let body = http_get_text(&url)?;
    let pack: WordPackFile = serde_json::from_str(&body)
        .map_err(|e| anyhow!("Invalid word pack JSON from {url}: {e}"))?;
    fs::write(&dest, &body)?;
    Ok(pack)
}

fn read_pack_file(path: &Path) -> Result<WordPackFile> {
    let body = fs::read_to_string(path)
        .map_err(|e| anyhow!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&body).map_err(|e| anyhow!("Invalid word pack {}: {e}", path.display()))
}

fn http_get_text(url: &str) -> Result<String> {
    use std::time::Duration;

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .build();
    let response = agent
        .get(url)
        .call()
        .map_err(|e| anyhow!("Download failed ({url}): {e}"))?;
    response
        .into_string()
        .map_err(|e| anyhow!("Failed reading download body: {e}"))
}
