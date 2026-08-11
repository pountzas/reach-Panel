use super::protocol::Envelope;
use crate::db::Database;
use crate::input::{
    mouse_click, mouse_double_click, mouse_scroll, move_cursor_absolute, move_cursor_relative,
    press_combo, press_key, type_text, KeyPressRequest,
};
use crate::prediction::{get_suggestions, record_usage};
use crate::profiles::INTERNAL_PROFILE_ID;
use crate::services::{build_profile_snapshot, launch_quick_action, type_phrase_text};
use tauri::AppHandle;

/// Handle an authenticated companion message. Returns response envelopes (0+).
pub fn handle_message(
    app: &AppHandle,
    db: &Database,
    env: &Envelope,
) -> Vec<Envelope> {
    let id = env.id.clone();
    match env.msg_type.as_str() {
        "ping" => {
            let t = env.payload.get("t").cloned().unwrap_or(serde_json::json!(null));
            vec![Envelope::reply(id, "pong", serde_json::json!({ "t": t }))]
        }
        "key.press" => match serde_json::from_value::<KeyPressRequest>(env.payload.clone()) {
            Ok(req) => match press_key(req) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            },
            Err(e) => vec![Envelope::error(id, "bad_payload", e.to_string())],
        },
        "text.type" => {
            let text = env
                .payload
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match type_text(text) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            }
        }
        "key.combo" => {
            let keys: Vec<String> = env
                .payload
                .get("keys")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            match press_combo(keys) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            }
        }
        "mouse.moveRel" => {
            let dx = env.payload.get("dx").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let dy = env.payload.get("dy").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            match move_cursor_relative(dx, dy) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            }
        }
        "mouse.moveAbs" => {
            let x = env.payload.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let y = env.payload.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            match move_cursor_absolute(x, y) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            }
        }
        "mouse.click" => {
            let button = env
                .payload
                .get("button")
                .and_then(|v| v.as_str())
                .unwrap_or("left");
            match mouse_click(button) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            }
        }
        "mouse.doubleClick" => match mouse_double_click() {
            Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
            Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
        },
        "mouse.scroll" => {
            let delta = env.payload.get("delta").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let horizontal = env
                .payload
                .get("horizontal")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            match mouse_scroll(delta, horizontal) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "input_failed", e.to_string())],
            }
        }
        "phrase.type" => {
            let text = env
                .payload
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match type_phrase_text(text) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "phrase_failed", e)],
            }
        }
        "qa.launch" => {
            let action_type = env
                .payload
                .get("actionType")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let target = env
                .payload
                .get("target")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match launch_quick_action(app, action_type, target) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "qa_failed", e)],
            }
        }
        "predict.query" => {
            let profile_id = env
                .payload
                .get("profileId")
                .and_then(|v| v.as_str())
                .unwrap_or(INTERNAL_PROFILE_ID);
            let prefix = env
                .payload
                .get("prefix")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let language = env
                .payload
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("en");
            match get_suggestions(db, profile_id, prefix, language, 5) {
                Ok(suggestions) => vec![Envelope::reply(
                    id,
                    "predict.suggestions",
                    serde_json::json!({ "suggestions": suggestions }),
                )],
                Err(e) => vec![Envelope::error(id, "predict_failed", e.to_string())],
            }
        }
        "predict.record" => {
            let profile_id = env
                .payload
                .get("profileId")
                .and_then(|v| v.as_str())
                .unwrap_or(INTERNAL_PROFILE_ID);
            let word = env
                .payload
                .get("word")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let language = env
                .payload
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("en");
            match record_usage(db, profile_id, word, language) {
                Ok(()) => vec![Envelope::reply(id, "ok", serde_json::json!({}))],
                Err(e) => vec![Envelope::error(id, "predict_failed", e.to_string())],
            }
        }
        "profile.snapshot" => {
            let profile_id = env
                .payload
                .get("profileId")
                .and_then(|v| v.as_str())
                .unwrap_or(INTERNAL_PROFILE_ID);
            let language = env
                .payload
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("en");
            match build_profile_snapshot(db, profile_id, language) {
                Ok(snapshot) => match serde_json::to_value(snapshot) {
                    Ok(payload) => {
                        vec![Envelope::reply(id, "profile.snapshot.ok", payload)]
                    }
                    Err(e) => vec![Envelope::error(id, "snapshot_failed", e.to_string())],
                },
                Err(e) => vec![Envelope::error(id, "snapshot_failed", e)],
            }
        }
        "dictation.start" => {
            let language = env
                .payload
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("en");
            let sample_rate = env
                .payload
                .get("sampleRate")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            match super::dictation::start(language, sample_rate, db) {
                Ok(payload) => vec![Envelope::reply(id, "dictation.started", payload)],
                Err(e) => vec![Envelope::error(id, "dictation_failed", e)],
            }
        }
        "audio.chunk" => match super::dictation::push_chunk(&env.payload, app, db) {
            Ok(events) => {
                let mut out = vec![Envelope::reply(id.clone(), "ok", serde_json::json!({}))];
                for event in events {
                    let msg_type = event
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("dictation.partial");
                    let text = event.get("text").cloned().unwrap_or(serde_json::json!(""));
                    let is_final = event
                        .get("isFinal")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    out.push(Envelope::event(
                        msg_type,
                        serde_json::json!({ "text": text, "isFinal": is_final }),
                    ));
                }
                out
            }
            Err(e) => vec![Envelope::error(id, "dictation_failed", e)],
        },
        "dictation.stop" => {
            // Optional final encoded blob in stop payload.
            if env.payload.get("data").and_then(|v| v.as_str()).is_some() {
                if let Err(e) = super::dictation::push_chunk(&env.payload, app, db) {
                    return vec![Envelope::error(id, "dictation_failed", e)];
                }
            }
            match super::dictation::stop(app, db) {
                Ok(payload) => vec![Envelope::reply(id, "dictation.final", payload)],
                Err(e) => vec![Envelope::error(id, "dictation_failed", e)],
            }
        }
        other => vec![Envelope::error(
            id,
            "unknown_type",
            format!("Unsupported message type: {other}"),
        )],
    }
}
