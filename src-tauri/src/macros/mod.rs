use crate::db::{Database, MacroDef, MacroStep};
use crate::input::{press_combo, press_key, type_text, KeyPressRequest};
use crate::tts::{speak_text, TtsSettings};
use anyhow::Result;
use serde_json::Value;
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

fn profile_language(db: &Database, profile_id: &str) -> String {
    db.get_profiles()
        .ok()
        .and_then(|profiles| {
            profiles
                .into_iter()
                .find(|p| p.id == profile_id)
                .and_then(|p| serde_json::from_str::<serde_json::Value>(&p.settings_json).ok())
                .and_then(|v| {
                    v.get("uiLanguage")
                        .and_then(|l| l.as_str())
                        .or_else(|| v.get("language").and_then(|l| l.as_str()))
                        .map(String::from)
                })
        })
        .unwrap_or_else(|| "en".to_string())
}

async fn run_blocking<T, F>(f: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| anyhow::anyhow!("blocking task join failed: {e}"))?
}

pub async fn run_macro(
    app: &tauri::AppHandle,
    db: &Database,
    macro_id: &str,
) -> Result<()> {
    let macro_def = db
        .get_macro_by_id(macro_id)?
        .ok_or_else(|| anyhow::anyhow!("Macro not found"))?;
    let language = profile_language(db, &macro_def.profile_id);
    let steps = db.get_macro_steps(macro_id)?;
    for step in steps {
        let payload: Value = serde_json::from_str(&step.payload_json)?;
        match step.action_type.as_str() {
            "type_text" => {
                if let Some(text) = payload.get("text").and_then(|v| v.as_str()) {
                    let text = text.to_string();
                    run_blocking(move || type_text(&text)).await?;
                }
            }
            "key_press" => {
                let key = payload.get("key").and_then(|v| v.as_str()).unwrap_or("");
                let modifiers: Vec<String> = payload
                    .get("modifiers")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                let key = key.to_string();
                run_blocking(move || {
                    press_key(KeyPressRequest {
                        key,
                        modifiers,
                    })
                })
                .await?;
            }
            "key_combo" => {
                let keys: Vec<String> = payload
                    .get("keys")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                run_blocking(move || press_combo(keys)).await?;
            }
            "open_program" => {
                if let Some(target) = payload.get("target").and_then(|v| v.as_str()) {
                    let _ = app.opener().open_path(target, None::<&str>);
                }
            }
            "open_url" => {
                if let Some(url) = payload.get("url").and_then(|v| v.as_str()) {
                    let _ = app.opener().open_url(url, None::<&str>);
                }
            }
            "wait" => {
                let ms = payload.get("ms").and_then(|v| v.as_u64()).unwrap_or(1000);
                tokio::time::sleep(Duration::from_millis(ms)).await;
            }
            "speak" => {
                if let Some(text) = payload.get("text").and_then(|v| v.as_str()) {
                    let text = text.to_string();
                    let language = language.clone();
                    run_blocking(move || {
                        speak_text(
                            &text,
                            TtsSettings {
                                rate: 0,
                                volume: 100,
                                language,
                            },
                        )
                    })
                    .await?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

pub fn export_macro(db: &Database, macro_id: &str) -> Result<String> {
    let steps = db.get_macro_steps(macro_id)?;
    let macro_def = db
        .get_macro_by_id(macro_id)?
        .ok_or_else(|| anyhow::anyhow!("Macro not found"))?;
    Ok(serde_json::json!({ "macro": macro_def, "steps": steps }).to_string())
}

pub fn import_macro(db: &Database, json: &str) -> Result<MacroDef> {
    let value: Value = serde_json::from_str(json)?;
    let macro_def: MacroDef = serde_json::from_value(value["macro"].clone())?;
    let steps: Vec<MacroStep> = serde_json::from_value(value["steps"].clone())?;
    db.save_macro(&macro_def, &steps)?;
    Ok(macro_def)
}
