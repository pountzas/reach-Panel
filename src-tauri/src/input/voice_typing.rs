/// Restore the last text field, then send Win+H. If restore fails, Win+H is not sent.
pub fn launch_windows_voice_typing_with<E, R, S>(
    restore: R,
    send_combo: S,
) -> Result<(), E>
where
    R: FnOnce() -> Result<(), E>,
    S: FnOnce([&str; 2]) -> Result<(), E>,
{
    restore()?;
    send_combo(["win", "h"])
}

pub fn launch_windows_voice_typing() -> anyhow::Result<()> {
    launch_windows_voice_typing_with(
        || {
            crate::input::focus_target::restore_target_focus().map_err(|err| err.to_string())
        },
        |combo| {
            crate::input::press_combo(combo.into_iter().map(str::to_string).collect())
                .map_err(|err| err.to_string())
        },
    )
    .map_err(anyhow::Error::msg)
}

#[cfg(test)]
mod tests {
    use super::launch_windows_voice_typing_with;

    #[test]
    fn no_target_does_not_send_win_h() {
        let mut sent = false;
        let err = launch_windows_voice_typing_with(
            || Err("Select a text field to type into"),
            |_| {
                sent = true;
                Ok(())
            },
        );
        assert_eq!(err, Err("Select a text field to type into"));
        assert!(!sent);
    }

    #[test]
    fn refocus_then_sends_win_h() {
        let log = std::cell::RefCell::new(Vec::new());
        let result: Result<(), &'static str> = launch_windows_voice_typing_with(
            || {
                log.borrow_mut().push("restore");
                Ok(())
            },
            |combo| {
                log.borrow_mut().push("send");
                assert_eq!(combo, ["win", "h"]);
                Ok(())
            },
        );
        assert!(result.is_ok());
        assert_eq!(log.into_inner(), ["restore", "send"]);
    }
}
