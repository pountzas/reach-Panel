//! Persistent logs for ReachPanel.
//!
//! Never log typed or dictated text, typed buffers, suggestion words, clipboard
//! contents, Groq or API keys, the full `settings_json`, or companion pairing
//! secrets. Lengths, counts, ids, and enum states are fine.

use tauri::plugin::TauriPlugin;
use tauri::{Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const MAX_LOG_FILE_SIZE: u128 = 2_000_000;
const KEEP_LOG_FILES: usize = 5;

fn is_key_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

pub fn redact(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(idx) = rest.find("gsk_") {
        out.push_str(&rest[..idx]);
        out.push_str("gsk_***");
        rest = &rest[idx + 4..];
        let skip = rest.find(|c: char| !is_key_char(c)).unwrap_or(rest.len());
        rest = &rest[skip..];
    }
    out.push_str(rest);
    out
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets([
            Target::new(TargetKind::LogDir {
                file_name: Some("reach-panel".into()),
            }),
            Target::new(TargetKind::Stdout),
        ])
        .max_file_size(MAX_LOG_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_LOG_FILES))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .level(log::LevelFilter::Info)
        .filter(|metadata| {
            let target = metadata.target();
            metadata.level() > log::Level::Trace
                || !(target.starts_with("tao") || target.starts_with("wry"))
        });

    #[cfg(debug_assertions)]
    let builder = builder
        .level_for("reach_panel_lib", log::LevelFilter::Debug)
        .target(Target::new(TargetKind::Webview));

    builder.build()
}

pub fn log_session_start<R: Runtime>(app: &tauri::App<R>) {
    let version = app.package_info().version.to_string();
    let windows_build = windows_build_number();
    let webview2 = tauri::webview_version().unwrap_or_else(|_| "unknown".into());
    let monitors = crate::window::list_monitors();
    let dpi = monitors
        .iter()
        .map(|m| format!("{}:{:.2}", m.id, m.scale_factor))
        .collect::<Vec<_>>()
        .join(",");
    let mode = active_mode(app);
    log::info!(
        "session start version={version} windows_build={windows_build} webview2={webview2} monitors={} dpi=[{dpi}] mode={mode}",
        monitors.len()
    );
}

fn active_mode<R: Runtime>(app: &tauri::App<R>) -> &'static str {
    let Some(state) = app.try_state::<crate::AppState>() else {
        return "unknown";
    };
    match state
        .db
        .get_profile_by_id(crate::profiles::INTERNAL_PROFILE_ID)
    {
        Ok(Some(profile)) => match serde_json::from_str(&profile.settings_json) {
            Ok(settings) => active_mode_from_settings(&settings),
            Err(_) => "unknown",
        },
        _ => "unknown",
    }
}

fn active_mode_from_settings(settings: &serde_json::Value) -> &'static str {
    if settings.get("micMode").and_then(|v| v.as_bool()) == Some(true) {
        "mic"
    } else if settings.get("focusModeOverride").and_then(|v| v.as_bool()) == Some(true) {
        "focus"
    } else if settings.get("keyboardSectionMode").and_then(|v| v.as_str()) == Some("synthesizer") {
        "teaching"
    } else {
        "normal"
    }
}

/// True OS build via `RtlGetVersion` (avoids GetVersionExW compatibility lies).
fn windows_build_number() -> u32 {
    #[repr(C)]
    struct OsVersionInfoW {
        dw_os_version_info_size: u32,
        dw_major_version: u32,
        dw_minor_version: u32,
        dw_build_number: u32,
        dw_platform_id: u32,
        sz_csd_version: [u16; 128],
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
    }

    unsafe {
        let mut info = std::mem::zeroed::<OsVersionInfoW>();
        info.dw_os_version_info_size = std::mem::size_of::<OsVersionInfoW>() as u32;
        if RtlGetVersion(&mut info) == 0 {
            return info.dw_build_number;
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::{active_mode_from_settings, redact};

    #[test]
    fn redacts_groq_api_key_to_gsk_stars() {
        assert_eq!(
            redact("Authorization: Bearer gsk_abc123XYZ"),
            "Authorization: Bearer gsk_***"
        );
    }

    #[test]
    fn leaves_text_without_a_key_unchanged() {
        assert_eq!(redact("transcript len=12"), "transcript len=12");
    }

    #[test]
    fn redacts_every_groq_key() {
        assert_eq!(redact("gsk_one then gsk_two"), "gsk_*** then gsk_***");
    }

    #[test]
    fn active_mode_reads_enum_fields_only() {
        let settings = serde_json::json!({
            "focusModeOverride": true,
            "micMode": false,
            "groqApiKey": "gsk_should_not_matter"
        });
        assert_eq!(active_mode_from_settings(&settings), "focus");
        let mic = serde_json::json!({ "micMode": true, "focusModeOverride": true });
        assert_eq!(active_mode_from_settings(&mic), "mic");
        let teaching = serde_json::json!({ "keyboardSectionMode": "synthesizer" });
        assert_eq!(active_mode_from_settings(&teaching), "teaching");
        assert_eq!(active_mode_from_settings(&serde_json::json!({})), "normal");
    }
}
