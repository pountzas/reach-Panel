//! Language hints for Groq Whisper transcriptions.

/// ISO-639-1 language code for Groq Whisper transcriptions.
pub fn groq_language_hint(language: &str) -> &'static str {
    match language {
        "el" => "el",
        "de" => "de",
        "fr" => "fr",
        "it" => "it",
        "es" => "es",
        "pt" => "pt",
        _ => "en",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_mappings() {
        assert_eq!(groq_language_hint("el"), "el");
        assert_eq!(groq_language_hint("en"), "en");
        assert_eq!(groq_language_hint("de"), "de");
        assert_eq!(groq_language_hint("fr"), "fr");
        assert_eq!(groq_language_hint("it"), "it");
        assert_eq!(groq_language_hint("es"), "es");
        assert_eq!(groq_language_hint("pt"), "pt");
    }
}
