//! Last-session marker in the logs directory.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const MARKER_FILE: &str = "session.json";
pub const BREADCRUMBS_FILE: &str = "breadcrumbs.log";
pub const LOG_FILE: &str = "reach-panel.log";
pub const APP_IDENTIFIER: &str = "com.nik.reach-panel";

pub fn default_logs_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join(APP_IDENTIFIER).join("logs")
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionMarker {
    pub pid: u32,
    pub started_at: String,
    pub version: String,
    pub clean_exit: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarkerRead {
    Missing,
    Corrupt,
    Present(SessionMarker),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UncleanPrevious {
    pub reason: String,
    pub started_at: String,
    pub last_breadcrumb: String,
}

pub fn marker_path(logs_dir: &Path) -> PathBuf {
    logs_dir.join(MARKER_FILE)
}

pub fn read_marker(logs_dir: &Path) -> MarkerRead {
    match fs::read_to_string(marker_path(logs_dir)) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => MarkerRead::Missing,
        Err(_) => MarkerRead::Corrupt,
        Ok(text) => serde_json::from_str(&text)
            .map(MarkerRead::Present)
            .unwrap_or(MarkerRead::Corrupt),
    }
}

pub fn write_marker(logs_dir: &Path, marker: &SessionMarker) -> std::io::Result<()> {
    fs::create_dir_all(logs_dir)?;
    let json = serde_json::to_vec_pretty(marker).map_err(std::io::Error::other)?;
    fs::write(marker_path(logs_dir), json)
}

pub fn begin_session(logs_dir: &Path, version: &str, pid: u32) -> Option<UncleanPrevious> {
    let previous = match read_marker(logs_dir) {
        MarkerRead::Present(marker) if !marker.clean_exit => Some(UncleanPrevious {
            reason: marker.reason.unwrap_or_else(|| "unknown".into()),
            started_at: marker.started_at,
            last_breadcrumb: last_breadcrumb(logs_dir),
        }),
        MarkerRead::Corrupt => Some(UncleanPrevious {
            reason: "unknown".into(),
            started_at: String::new(),
            last_breadcrumb: last_breadcrumb(logs_dir),
        }),
        MarkerRead::Missing | MarkerRead::Present(_) => None,
    };

    let started_at = chrono::Local::now().to_rfc3339();
    let marker = SessionMarker {
        pid,
        started_at,
        version: version.to_string(),
        clean_exit: false,
        reason: None,
    };
    let _ = write_marker(logs_dir, &marker);
    previous
}

pub fn mark_clean_exit(logs_dir: &Path) -> std::io::Result<()> {
    match read_marker(logs_dir) {
        MarkerRead::Present(mut marker) => {
            marker.clean_exit = true;
            write_marker(logs_dir, &marker)
        }
        _ => Ok(()),
    }
}

pub fn mark_panic(logs_dir: &Path) -> std::io::Result<()> {
    match read_marker(logs_dir) {
        MarkerRead::Present(mut marker) => {
            marker.reason = Some("panic".into());
            marker.clean_exit = false;
            write_marker(logs_dir, &marker)
        }
        MarkerRead::Missing | MarkerRead::Corrupt => {
            let marker = SessionMarker {
                pid: std::process::id(),
                started_at: chrono::Local::now().to_rfc3339(),
                version: env!("CARGO_PKG_VERSION").into(),
                clean_exit: false,
                reason: Some("panic".into()),
            };
            write_marker(logs_dir, &marker)
        }
    }
}

pub fn last_breadcrumb(logs_dir: &Path) -> String {
    last_nonempty_line_in(logs_dir.join(BREADCRUMBS_FILE))
        .or_else(|| last_nonempty_line_in(logs_dir.join(LOG_FILE)))
        .unwrap_or_default()
}

fn last_nonempty_line_in(path: PathBuf) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    text.lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_logs() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-session-test-{nanos}"));
        fs::create_dir_all(&dir).expect("temp logs dir");
        dir
    }

    fn sample_marker() -> SessionMarker {
        SessionMarker {
            pid: 4242,
            started_at: "2026-11-03T12:00:00+00:00".into(),
            version: "0.17.5".into(),
            clean_exit: false,
            reason: None,
        }
    }

    #[test]
    fn writes_then_reads_session_marker() {
        let dir = temp_logs();
        let marker = sample_marker();
        write_marker(&dir, &marker).expect("write");
        assert_eq!(read_marker(&dir), MarkerRead::Present(marker));
    }

    #[test]
    fn missing_marker_file_is_missing() {
        let dir = temp_logs();
        assert_eq!(read_marker(&dir), MarkerRead::Missing);
    }

    #[test]
    fn corrupt_marker_file_is_corrupt() {
        let dir = temp_logs();
        fs::write(dir.join(MARKER_FILE), "{not-json").expect("write corrupt");
        assert_eq!(read_marker(&dir), MarkerRead::Corrupt);
    }

    #[test]
    fn begin_session_reports_unclean_previous_and_starts_new_unclean() {
        let dir = temp_logs();
        let previous = SessionMarker {
            pid: 7,
            started_at: "2026-01-01T00:00:00+00:00".into(),
            version: "0.17.4".into(),
            clean_exit: false,
            reason: Some("panic".into()),
        };
        write_marker(&dir, &previous).expect("write previous");
        fs::write(dir.join(BREADCRUMBS_FILE), "layout ratio=0.5\n").expect("breadcrumb");

        let unclean = begin_session(&dir, "0.17.5", 99).expect("unclean previous");
        assert_eq!(unclean.reason, "panic");
        assert_eq!(unclean.started_at, "2026-01-01T00:00:00+00:00");
        assert_eq!(unclean.last_breadcrumb, "layout ratio=0.5");

        match read_marker(&dir) {
            MarkerRead::Present(marker) => {
                assert_eq!(marker.pid, 99);
                assert_eq!(marker.version, "0.17.5");
                assert!(!marker.clean_exit);
                assert_eq!(marker.reason, None);
            }
            other => panic!("expected new marker, got {other:?}"),
        }
    }

    #[test]
    fn begin_session_after_clean_exit_does_not_report_unclean() {
        let dir = temp_logs();
        let previous = SessionMarker {
            pid: 7,
            started_at: "2026-01-01T00:00:00+00:00".into(),
            version: "0.17.4".into(),
            clean_exit: true,
            reason: None,
        };
        write_marker(&dir, &previous).expect("write previous");
        assert_eq!(begin_session(&dir, "0.17.5", 99), None);
    }

    #[test]
    fn begin_session_missing_previous_does_not_report_unclean() {
        let dir = temp_logs();
        assert_eq!(begin_session(&dir, "0.17.5", 99), None);
        match read_marker(&dir) {
            MarkerRead::Present(marker) => {
                assert!(!marker.clean_exit);
                assert_eq!(marker.version, "0.17.5");
            }
            other => panic!("expected new marker, got {other:?}"),
        }
    }

    #[test]
    fn begin_session_corrupt_previous_is_unclean_unknown() {
        let dir = temp_logs();
        fs::write(dir.join(MARKER_FILE), "nope").expect("write corrupt");
        let unclean = begin_session(&dir, "0.17.5", 99).expect("unclean");
        assert_eq!(unclean.reason, "unknown");
        assert_eq!(unclean.started_at, "");
    }

    #[test]
    fn mark_clean_exit_transitions_unclean_marker() {
        let dir = temp_logs();
        write_marker(&dir, &sample_marker()).expect("write");
        mark_clean_exit(&dir).expect("mark clean");
        match read_marker(&dir) {
            MarkerRead::Present(marker) => {
                assert!(marker.clean_exit);
                assert_eq!(marker.pid, 4242);
            }
            other => panic!("expected marker, got {other:?}"),
        }
    }

    #[test]
    fn mark_panic_sets_reason_and_keeps_exit_unclean() {
        let dir = temp_logs();
        write_marker(&dir, &sample_marker()).expect("write");
        mark_panic(&dir).expect("mark panic");
        match read_marker(&dir) {
            MarkerRead::Present(marker) => {
                assert!(!marker.clean_exit);
                assert_eq!(marker.reason.as_deref(), Some("panic"));
            }
            other => panic!("expected marker, got {other:?}"),
        }
    }

    #[test]
    fn last_breadcrumb_reads_ring_file_when_present() {
        let dir = temp_logs();
        fs::write(
            dir.join(BREADCRUMBS_FILE),
            "older\nlayout ratio=0.42 monitor=1\n",
        )
        .expect("write breadcrumbs");
        fs::write(dir.join(LOG_FILE), "log line that should lose\n").expect("write log");
        assert_eq!(last_breadcrumb(&dir), "layout ratio=0.42 monitor=1");
    }

    #[test]
    fn last_breadcrumb_falls_back_to_log_tail() {
        let dir = temp_logs();
        fs::write(dir.join(LOG_FILE), "first\n[main] window: resized w=100\n").expect("write log");
        assert_eq!(last_breadcrumb(&dir), "[main] window: resized w=100");
    }

    #[test]
    fn last_breadcrumb_missing_files_is_empty() {
        let dir = temp_logs();
        assert_eq!(last_breadcrumb(&dir), "");
    }
}
