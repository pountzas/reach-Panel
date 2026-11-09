//! STT info-log formatters. Lengths, durations, and status only — never transcript text.

pub(crate) fn start_log_line(engine: &str, language: &str) -> String {
    format!("stt start engine={engine} language={language}")
}

pub(crate) fn result_log_line(engine: &str, status: &str, transcript_chars: usize) -> String {
    format!("stt result engine={engine} status={status} chars={transcript_chars}")
}

pub(crate) fn groq_post_log_line(wav_bytes: usize, duration_ms: u128, http_status: u16) -> String {
    format!("stt groq post bytes={wav_bytes} duration_ms={duration_ms} http={http_status}")
}

pub(crate) fn groq_empty_audio_message(wav_bytes: usize) -> Option<&'static str> {
    if wav_bytes == 0 {
        Some("No speech captured. Check the microphone.")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_log_line_uses_engine_and_resolved_language() {
        assert_eq!(
            start_log_line("winrt", "en-US"),
            "stt start engine=winrt language=en-US"
        );
        assert_eq!(
            start_log_line("groq", "el"),
            "stt start engine=groq language=el"
        );
    }

    #[test]
    fn result_log_line_uses_engine_status_and_char_count() {
        assert_eq!(
            result_log_line("winrt", "TimeoutExceeded", 0),
            "stt result engine=winrt status=TimeoutExceeded chars=0"
        );
    }

    #[test]
    fn groq_post_log_line_uses_bytes_duration_and_http() {
        assert_eq!(
            groq_post_log_line(2048, 350, 200),
            "stt groq post bytes=2048 duration_ms=350 http=200"
        );
    }

    #[test]
    fn groq_empty_audio_message_when_wav_bytes_zero() {
        assert_eq!(
            groq_empty_audio_message(0),
            Some("No speech captured. Check the microphone.")
        );
    }

    #[test]
    fn groq_empty_audio_message_none_when_wav_has_bytes() {
        assert_eq!(groq_empty_audio_message(44), None);
    }
}
