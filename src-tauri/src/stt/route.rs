//! Pure STT engine routing (WinRT when online+supported, else Groq cloud).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttEngine {
    WinRt,
    Groq,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouteDecision {
    Use(SttEngine),
    /// Online but no WinRT language pack and no Groq API key, or offline.
    Unavailable,
}

/// Prefer WinRT for any Windows-supported language when online; otherwise Groq.
pub fn select_engine(online: bool, winrt_supported: bool, groq_configured: bool) -> RouteDecision {
    if !online {
        return RouteDecision::Unavailable;
    }
    if winrt_supported {
        RouteDecision::Use(SttEngine::WinRt)
    } else if groq_configured {
        RouteDecision::Use(SttEngine::Groq)
    } else {
        RouteDecision::Unavailable
    }
}

/// Mic can start when the selected path can actually run.
pub fn can_dictate(online: bool, winrt_supported: bool, groq_configured: bool) -> bool {
    !matches!(
        select_engine(online, winrt_supported, groq_configured),
        RouteDecision::Unavailable
    )
}

/// ISO-639-1 language code for Groq Whisper transcriptions.
pub fn groq_language_hint(language: &str) -> &'static str {
    match language {
        "el" => "el",
        _ => "en",
    }
}

/// BCP-47 tag used for WinRT SpeechRecognizer.
pub fn winrt_language_tag(language: &str) -> &'static str {
    match language {
        "el" => "el-GR",
        _ => "en-US",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn online_supported_uses_winrt() {
        assert_eq!(
            select_engine(true, true, false),
            RouteDecision::Use(SttEngine::WinRt)
        );
        assert_eq!(
            select_engine(true, true, true),
            RouteDecision::Use(SttEngine::WinRt)
        );
    }

    #[test]
    fn offline_is_unavailable() {
        assert_eq!(
            select_engine(false, true, true),
            RouteDecision::Unavailable
        );
        assert_eq!(
            select_engine(false, false, true),
            RouteDecision::Unavailable
        );
    }

    #[test]
    fn unsupported_language_uses_groq_when_configured() {
        assert_eq!(
            select_engine(true, false, true),
            RouteDecision::Use(SttEngine::Groq)
        );
    }

    #[test]
    fn unavailable_when_groq_needed_but_not_configured() {
        assert_eq!(
            select_engine(true, false, false),
            RouteDecision::Unavailable
        );
    }

    #[test]
    fn can_dictate_matches_route() {
        assert!(can_dictate(true, true, false));
        assert!(can_dictate(true, false, true));
        assert!(!can_dictate(false, true, true));
        assert!(!can_dictate(true, false, false));
        assert!(!can_dictate(false, false, false));
    }

    #[test]
    fn language_mappings() {
        assert_eq!(groq_language_hint("el"), "el");
        assert_eq!(groq_language_hint("en"), "en");
        assert_eq!(winrt_language_tag("el"), "el-GR");
        assert_eq!(winrt_language_tag("en"), "en-US");
    }
}
