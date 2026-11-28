//! PC Mic button shortcut configuration and hold-to-talk injection.

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PcMicConfig {
    pub keys: Vec<String>,
    pub hold: bool,
}

/// Read Mic-button shortcut from persisted profile settings (`settings_json`).
pub fn pc_mic_config_from_settings(settings: &Value) -> PcMicConfig {
    let mode = settings
        .get("pcMicSendMode")
        .and_then(|v| v.as_str())
        .unwrap_or("winH");
    match mode {
        "rightAltHold" => PcMicConfig {
            keys: vec!["ralt".into()],
            hold: true,
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
            PcMicConfig { keys, hold: false }
        }
        _ => PcMicConfig {
            keys: vec!["win".into(), "h".into()],
            hold: false,
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

pub fn pc_mic_hold_down(config: &PcMicConfig) -> anyhow::Result<()> {
    if !config.hold {
        return Err(anyhow::anyhow!("Mic shortcut is not in hold mode"));
    }
    crate::input::focus_target::restore_target_for_pc_mic()?;
    crate::input::hold_combo_down(config.keys.clone())
}

pub fn pc_mic_hold_up() -> anyhow::Result<()> {
    crate::input::release_held_combo_keys()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_mode_sends_win_h_without_hold() {
        let cfg = pc_mic_config_from_settings(&serde_json::json!({}));
        assert_eq!(
            cfg,
            PcMicConfig {
                keys: vec!["win".into(), "h".into()],
                hold: false,
            }
        );
    }

    #[test]
    fn right_alt_preset_uses_ralt_and_hold() {
        let cfg = pc_mic_config_from_settings(&serde_json::json!({
            "pcMicSendMode": "rightAltHold"
        }));
        assert_eq!(
            cfg,
            PcMicConfig {
                keys: vec!["ralt".into()],
                hold: true,
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
                hold: false,
            }
        );
    }
}
