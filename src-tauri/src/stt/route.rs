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

/// Languages where Windows speech packs are missing or unreliable — always prefer Groq.
pub fn prefer_cloud_stt(language: &str) -> bool {
    matches!(language, "el")
}

/// Prefer WinRT for Windows-supported languages when online; Groq otherwise.
/// Greek (`el`) always uses Groq when a key is configured.
pub fn select_engine(
    online: bool,
    winrt_supported: bool,
    groq_configured: bool,
    prefer_cloud: bool,
) -> RouteDecision {
    if !online {
        return RouteDecision::Unavailable;
    }
    if prefer_cloud && groq_configured {
        return RouteDecision::Use(SttEngine::Groq);
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
pub fn can_dictate(
    online: bool,
    winrt_supported: bool,
    groq_configured: bool,
    prefer_cloud: bool,
) -> bool {
    !matches!(
        select_engine(online, winrt_supported, groq_configured, prefer_cloud),
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
            select_engine(true, true, false, false),
            RouteDecision::Use(SttEngine::WinRt)
        );
        assert_eq!(
            select_engine(true, true, true, false),
            RouteDecision::Use(SttEngine::WinRt)
        );
    }

    #[test]
    fn greek_prefers_groq_when_configured() {
        assert_eq!(
            select_engine(true, true, true, true),
            RouteDecision::Use(SttEngine::Groq)
        );
        assert_eq!(
            select_engine(true, false, true, true),
            RouteDecision::Use(SttEngine::Groq)
        );
    }

    #[test]
    fn greek_falls_back_to_winrt_without_key() {
        assert_eq!(
            select_engine(true, true, false, true),
            RouteDecision::Use(SttEngine::WinRt)
        );
        assert_eq!(
            select_engine(true, false, false, true),
            RouteDecision::Unavailable
        );
    }

    #[test]
    fn offline_is_unavailable() {
        assert_eq!(
            select_engine(false, true, true, false),
            RouteDecision::Unavailable
        );
        assert_eq!(
            select_engine(false, false, true, true),
            RouteDecision::Unavailable
        );
    }

    #[test]
    fn unsupported_language_uses_groq_when_configured() {
        assert_eq!(
            select_engine(true, false, true, false),
            RouteDecision::Use(SttEngine::Groq)
        );
    }

    #[test]
    fn unavailable_when_groq_needed_but_not_configured() {
        assert_eq!(
            select_engine(true, false, false, false),
            RouteDecision::Unavailable
        );
    }

    #[test]
    fn can_dictate_matches_route() {
        assert!(can_dictate(true, true, false, false));
        assert!(can_dictate(true, false, true, false));
        assert!(can_dictate(true, false, true, true));
        assert!(!can_dictate(false, true, true, false));
        assert!(!can_dictate(true, false, false, false));
        assert!(!can_dictate(true, false, false, true));
    }

    #[test]
    fn language_mappings() {
        assert!(prefer_cloud_stt("el"));
        assert!(!prefer_cloud_stt("en"));
        assert_eq!(groq_language_hint("el"), "el");
        assert_eq!(groq_language_hint("en"), "en");
        assert_eq!(winrt_language_tag("el"), "el-GR");
        assert_eq!(winrt_language_tag("en"), "en-US");
    }
}
