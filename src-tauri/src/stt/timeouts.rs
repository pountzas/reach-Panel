use std::time::Duration;
use windows::Foundation::TimeSpan;

pub const NO_INPUT_TARGET: &str = "Select a text field to dictate";

pub const INITIAL_SILENCE: Duration = Duration::from_secs(5);
pub const END_SILENCE: Duration = Duration::from_secs(10);
pub const AUTO_STOP_SILENCE: Duration = Duration::from_secs(10);
pub const STOP_ASYNC: Duration = Duration::from_secs(3);
pub const MAX_SESSION: Duration = Duration::from_secs(60);

pub fn duration_to_winrt(duration: Duration) -> TimeSpan {
    TimeSpan {
        Duration: (duration.as_nanos() / 100) as i64,
    }
}

pub struct WinrtSilenceTimeouts {
    pub initial: TimeSpan,
    pub end: TimeSpan,
    pub auto_stop: TimeSpan,
}

pub fn winrt_silence_timeouts() -> WinrtSilenceTimeouts {
    WinrtSilenceTimeouts {
        initial: duration_to_winrt(INITIAL_SILENCE),
        end: duration_to_winrt(END_SILENCE),
        auto_stop: duration_to_winrt(AUTO_STOP_SILENCE),
    }
}

pub fn refuse_start_without_focus(input_focused: bool) -> Result<(), &'static str> {
    if input_focused {
        Ok(())
    } else {
        Err(NO_INPUT_TARGET)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_refused_without_focus() {
        assert_eq!(
            refuse_start_without_focus(false).unwrap_err(),
            NO_INPUT_TARGET
        );
        assert!(refuse_start_without_focus(true).is_ok());
    }

    #[test]
    fn timeout_values_match_spec() {
        assert_eq!(INITIAL_SILENCE, Duration::from_secs(5));
        assert_eq!(END_SILENCE, Duration::from_secs(10));
        assert_eq!(AUTO_STOP_SILENCE, Duration::from_secs(10));
        assert_eq!(STOP_ASYNC, Duration::from_secs(3));
        assert_eq!(MAX_SESSION, Duration::from_secs(60));
    }

    #[test]
    fn duration_to_winrt_uses_100ns_ticks() {
        assert_eq!(duration_to_winrt(Duration::from_secs(5)).Duration, 50_000_000);
        assert_eq!(duration_to_winrt(Duration::from_secs(10)).Duration, 100_000_000);
        assert_eq!(duration_to_winrt(Duration::from_secs(3)).Duration, 30_000_000);
    }

    #[test]
    fn winrt_silence_timeouts_match_spec_ticks() {
        let t = winrt_silence_timeouts();
        assert_eq!(t.initial.Duration, 50_000_000);
        assert_eq!(t.end.Duration, 100_000_000);
        assert_eq!(t.auto_stop.Duration, 100_000_000);
    }
}
