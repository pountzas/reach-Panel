//! Pure STT engine routing (WinRT when online+supported, else Whisper).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttEngine {
    WinRt,
    Whisper,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RouteDecision {
    Use(SttEngine),
    /// Need Whisper but the local model is not ready.
    Unavailable,
}

/// Prefer WinRT for any Windows-supported language when online; otherwise Whisper.
pub fn select_engine(online: bool, winrt_supported: bool, whisper_ready: bool) -> RouteDecision {
    if online && winrt_supported {
        RouteDecision::Use(SttEngine::WinRt)
    } else if whisper_ready {
        RouteDecision::Use(SttEngine::Whisper)
    } else {
        RouteDecision::Unavailable
    }
}

/// Mic can start when the selected path can actually run.
pub fn can_dictate(online: bool, winrt_supported: bool, whisper_ready: bool) -> bool {
    !matches!(
        select_engine(online, winrt_supported, whisper_ready),
        RouteDecision::Unavailable
    )
}

/// Whisper language hint from app language codes.
pub fn whisper_language_hint(language: &str) -> &'static str {
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
    fn offline_uses_whisper_when_ready() {
        assert_eq!(
            select_engine(false, true, true),
            RouteDecision::Use(SttEngine::Whisper)
        );
    }

    #[test]
    fn unsupported_language_uses_whisper_even_online() {
        assert_eq!(
            select_engine(true, false, true),
            RouteDecision::Use(SttEngine::Whisper)
        );
    }

    #[test]
    fn unavailable_when_whisper_needed_but_not_ready() {
        assert_eq!(
            select_engine(false, true, false),
            RouteDecision::Unavailable
        );
        assert_eq!(
            select_engine(true, false, false),
            RouteDecision::Unavailable
        );
    }

    #[test]
    fn can_dictate_matches_route() {
        assert!(can_dictate(true, true, false));
        assert!(can_dictate(false, true, true));
        assert!(can_dictate(true, false, true));
        assert!(!can_dictate(false, false, false));
        assert!(!can_dictate(true, false, false));
    }

    #[test]
    fn language_mappings() {
        assert_eq!(whisper_language_hint("el"), "el");
        assert_eq!(whisper_language_hint("en"), "en");
        assert_eq!(winrt_language_tag("el"), "el-GR");
        assert_eq!(winrt_language_tag("en"), "en-US");
    }
}
