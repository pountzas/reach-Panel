use crate::input::type_text;

/// Type phrase text into the focused target app.
/// Companion Speak stays on the tablet — host path is type-only.
pub fn type_phrase_text(text: &str) -> Result<(), String> {
    type_text(text).map_err(|e| e.to_string())
}
