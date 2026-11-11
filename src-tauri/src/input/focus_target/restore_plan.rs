#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreFocusPlan {
    LeaveForeground,
    Restore,
    Error(&'static str),
}

pub const FOREGROUND_RESTORE_FAILED: &str = "Could not return focus to the text field";
pub const NO_TYPING_TARGET: &str = "Select a text field to type into";

pub fn restore_focus_plan(
    ours_is_foreground: bool,
    has_target: bool,
    target_valid: bool,
) -> RestoreFocusPlan {
    if !ours_is_foreground {
        return RestoreFocusPlan::LeaveForeground;
    }
    if !has_target || !target_valid {
        return RestoreFocusPlan::Error(NO_TYPING_TARGET);
    }
    RestoreFocusPlan::Restore
}

#[cfg(test)]
pub fn foreground_restore_failed(wanted: isize, actual: isize) -> bool {
    wanted != actual
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leave_alone_when_we_are_not_foreground() {
        assert_eq!(
            restore_focus_plan(false, false, false),
            RestoreFocusPlan::LeaveForeground
        );
    }

    #[test]
    fn error_when_ours_and_no_target() {
        assert_eq!(
            restore_focus_plan(true, false, false),
            RestoreFocusPlan::Error(NO_TYPING_TARGET)
        );
    }

    #[test]
    fn error_when_ours_and_invalid_target() {
        assert_eq!(
            restore_focus_plan(true, true, false),
            RestoreFocusPlan::Error(NO_TYPING_TARGET)
        );
    }

    #[test]
    fn restore_when_ours_and_valid_target() {
        assert_eq!(
            restore_focus_plan(true, true, true),
            RestoreFocusPlan::Restore
        );
    }

    #[test]
    fn foreground_mismatch_is_failure() {
        assert!(foreground_restore_failed(1, 2));
        assert!(!foreground_restore_failed(1, 1));
    }
}
