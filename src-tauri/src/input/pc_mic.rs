//! PC Mic button shortcut configuration and one-shot injection.

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PcMicConfig {
    pub keys: Vec<String>,
}

/// Read Mic-button shortcut from persisted profile settings (`settings_json`).
pub fn pc_mic_config_from_settings(settings: &Value) -> PcMicConfig {
    let mode = settings
        .get("pcMicSendMode")
        .and_then(|v| v.as_str())
        .unwrap_or("winH");
    match mode {
        "rightAlt" | "rightAltHold" => PcMicConfig {
            keys: vec!["ralt".into()],
        },
        "custom" => {
            let keys = settings
                .get("pcMicCustomKeys")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                })
                .filter(|k| !k.is_empty())
                .unwrap_or_else(|| vec!["win".into(), "h".into()]);
            PcMicConfig { keys }
        }
        _ => PcMicConfig {
            keys: vec!["win".into(), "h".into()],
        },
    }
}

pub fn launch_pc_mic_tap(config: &PcMicConfig) -> anyhow::Result<()> {
    crate::input::voice_typing::launch_voice_typing_tap_with(
        || crate::input::focus_target::restore_target_for_pc_mic().map_err(|err| err.to_string()),
        |combo| crate::input::press_combo(combo).map_err(|err| err.to_string()),
        config.keys.clone(),
    )
    .map_err(anyhow::Error::msg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_mode_sends_win_h_tap() {
        let cfg = pc_mic_config_from_settings(&serde_json::json!({}));
        assert_eq!(
            cfg,
            PcMicConfig {
                keys: vec!["win".into(), "h".into()],
            }
        );
    }

    #[test]
    fn right_alt_preset_uses_ralt_tap() {
        let cfg = pc_mic_config_from_settings(&serde_json::json!({
            "pcMicSendMode": "rightAlt"
        }));
        assert_eq!(
            cfg,
            PcMicConfig {
                keys: vec!["ralt".into()],
            }
        );
    }

    #[test]
    fn legacy_right_alt_hold_preset_migrates_to_ralt_tap() {
        let cfg = pc_mic_config_from_settings(&serde_json::json!({
            "pcMicSendMode": "rightAltHold"
        }));
        assert_eq!(
            cfg,
            PcMicConfig {
                keys: vec!["ralt".into()],
            }
        );
    }

    #[test]
    fn password_field_blocks_without_sending() {
        use crate::input::voice_typing::launch_voice_typing_tap_with;
        let mut sent = false;
        let err = launch_voice_typing_tap_with(
            || Err("Mic shortcuts are not sent to password fields."),
            |_| {
                sent = true;
                Ok(())
            },
            vec!["ralt".into()],
        );
        assert_eq!(err, Err("Mic shortcuts are not sent to password fields."));
        assert!(!sent);
    }

    #[test]
    fn custom_mode_reads_key_combo() {
        let cfg = pc_mic_config_from_settings(&serde_json::json!({
            "pcMicSendMode": "custom",
            "pcMicCustomKeys": ["ctrl", "shift", "f9"]
        }));
        assert_eq!(
            cfg,
            PcMicConfig {
                keys: vec!["ctrl".into(), "shift".into(), "f9".into()],
            }
        );
    }
}