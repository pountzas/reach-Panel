use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use windows::Foundation::TimeSpan;

pub const NO_INPUT_TARGET: &str = "Select a text field to dictate";

pub const INITIAL_SILENCE: Duration = Duration::from_secs(5);
pub const END_SILENCE: Duration = Duration::from_millis(150);
pub const AUTO_STOP_SILENCE: Duration = Duration::from_secs(10);
pub const STOP_ASYNC: Duration = Duration::from_millis(800);
pub const MAX_SESSION: Duration = Duration::from_secs(60);

pub fn max_session_expired(elapsed: Duration, limit: Duration) -> bool {
    elapsed >= limit
}

pub fn wait_bounded_timed_out(elapsed: Duration, limit: Duration) -> bool {
    elapsed >= limit
}

pub fn wait_bounded<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
    limit: Duration,
) -> Result<T, ()> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(work());
    });
    rx.recv_timeout(limit).map_err(|_| ())
}

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
        assert_eq!(END_SILENCE, Duration::from_millis(150));
        assert_eq!(AUTO_STOP_SILENCE, Duration::from_secs(10));
        assert_eq!(STOP_ASYNC, Duration::from_millis(800));
        assert_eq!(MAX_SESSION, Duration::from_secs(60));
    }

    #[test]
    fn duration_to_winrt_uses_100ns_ticks() {
        assert_eq!(duration_to_winrt(Duration::from_secs(5)).Duration, 50_000_000);
        assert_eq!(duration_to_winrt(Duration::from_secs(10)).Duration, 100_000_000);
        assert_eq!(duration_to_winrt(STOP_ASYNC).Duration, 8_000_000);
    }

    #[test]
    fn winrt_silence_timeouts_match_spec_ticks() {
        let t = winrt_silence_timeouts();
        assert_eq!(t.initial.Duration, 50_000_000);
        assert_eq!(t.end.Duration, 1_500_000);
        assert_eq!(t.auto_stop.Duration, 100_000_000);
    }

    #[test]
    fn end_silence_finalizes_phrases_well_before_auto_stop() {
        assert!(END_SILENCE * 10 <= AUTO_STOP_SILENCE);
    }

    #[test]
    fn max_session_expires_at_limit() {
        assert!(!max_session_expired(Duration::from_secs(59), MAX_SESSION));
        assert!(max_session_expired(Duration::from_secs(60), MAX_SESSION));
    }

    #[test]
    fn stop_async_timeout_at_800_milliseconds() {
        assert!(!wait_bounded_timed_out(Duration::from_millis(799), STOP_ASYNC));
        assert!(wait_bounded_timed_out(Duration::from_millis(800), STOP_ASYNC));
    }

    #[test]
    fn wait_bounded_ok_before_limit() {
        assert_eq!(wait_bounded(|| 7_u8, Duration::from_secs(1)), Ok(7));
    }

    #[test]
    fn wait_bounded_err_on_timeout() {
        assert_eq!(
            wait_bounded(
                || {
                    thread::sleep(Duration::from_millis(200));
                    1_u8
                },
                Duration::from_millis(20)
            ),
            Err(())
        );
    }
}
