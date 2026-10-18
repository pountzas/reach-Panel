use serde::Serialize;

pub mod dictation;
pub mod files;
pub mod input_preview;
pub mod keyboard;
pub mod library;
pub mod mouse;
pub mod prediction;
pub mod profiles;
pub mod system;
pub mod teaching_pdf;
pub mod window;

#[derive(Debug, Serialize)]
pub(crate) struct CommandResult {
    pub success: bool,
    pub error: Option<String>,
}

pub(crate) fn ok() -> CommandResult {
    CommandResult {
        success: true,
        error: None,
    }
}

pub(crate) fn err(e: impl ToString) -> CommandResult {
    CommandResult {
        success: false,
        error: Some(e.to_string()),
    }
}
