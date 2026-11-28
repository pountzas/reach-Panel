/// Restore the last text field, then send a shortcut combo. If restore fails, nothing is sent.
pub fn launch_voice_typing_tap_with<E, R, S>(
    restore: R,
    send_combo: S,
    keys: Vec<String>,
) -> Result<(), E>
where
    R: FnOnce() -> Result<(), E>,
    S: FnOnce(Vec<String>) -> Result<(), E>,
{
    restore()?;
    send_combo(keys)
}

#[cfg(test)]
mod tests {
    use super::launch_voice_typing_tap_with;

    #[test]
    fn no_target_does_not_send_win_h() {
        let mut sent = false;
        let err = launch_voice_typing_tap_with(
            || Err("Select a text field to type into"),
            |_| {
                sent = true;
                Ok(())
            },
            vec!["win".into(), "h".into()],
        );
        assert_eq!(err, Err("Select a text field to type into"));
        assert!(!sent);
    }

    #[test]
    fn refocus_then_sends_configured_combo() {
        let log = std::cell::RefCell::new(Vec::new());
        let result: Result<(), &'static str> = launch_voice_typing_tap_with(
            || {
                log.borrow_mut().push("restore");
                Ok(())
            },
            |combo| {
                log.borrow_mut().push("send");
                assert_eq!(combo, ["ralt"]);
                Ok(())
            },
            vec!["ralt".into()],
        );
        assert!(result.is_ok());
        assert_eq!(log.into_inner(), ["restore", "send"]);
    }
}
