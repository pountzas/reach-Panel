//! Text diagnostics report assembled from the logs directory.

use super::session::{self, last_breadcrumb, MarkerRead, LOG_FILE};
use crate::logging::redact;
use std::fs;
use std::path::Path;

pub const LOG_TAIL_LINES: usize = 200;

pub struct DiagnosticsInfo {
    pub version: String,
    pub windows_build: String,
    pub webview2: String,
    pub previous_session: String,
}

pub fn collect_diagnostics_report(logs_dir: &Path, info: &DiagnosticsInfo) -> String {
    let mut lines = vec![
        format!("version: {}", info.version),
        format!("windows_build: {}", info.windows_build),
        format!("webview2: {}", info.webview2),
        format!("log_dir: {}", logs_dir.display()),
        format!("previous_session: {}", info.previous_session),
    ];
    let breadcrumb = last_breadcrumb(logs_dir);
    if !breadcrumb.is_empty() {
        lines.push(format!("last_breadcrumb: {}", redact(&breadcrumb)));
    }
    lines.push(String::new());
    lines.push("--- log tail ---".into());
    lines.extend(redacted_log_tail(logs_dir));
    lines.join("\n")
}

pub(crate) fn marker_status(read: &MarkerRead) -> &'static str {
    match read {
        MarkerRead::Missing => "missing",
        MarkerRead::Corrupt => "corrupt",
        MarkerRead::Present(marker) if marker.clean_exit => "clean",
        MarkerRead::Present(_) => "unclean",
    }
}

fn redacted_log_tail(logs_dir: &Path) -> Vec<String> {
    let text = fs::read_to_string(logs_dir.join(LOG_FILE)).unwrap_or_default();
    let all: Vec<&str> = text.lines().collect();
    let start = all.len().saturating_sub(LOG_TAIL_LINES);
    all[start..].iter().map(|line| redact(line)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_logs() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-diag-test-{nanos}"));
        fs::create_dir_all(&dir).expect("temp logs dir");
        dir
    }

    fn sample_info() -> DiagnosticsInfo {
        DiagnosticsInfo {
            version: "0.17.5".into(),
            windows_build: "22000".into(),
            webview2: "1.2.3.4".into(),
            previous_session: "clean".into(),
        }
    }

    #[test]
    fn redacts_gsk_token_in_log_tail() {
        let dir = temp_logs();
        fs::write(
            dir.join(LOG_FILE),
            "ok line\nAuthorization: Bearer gsk_abc123XYZ\n",
        )
        .expect("write log");

        let report = collect_diagnostics_report(&dir, &sample_info());
        assert!(
            report.contains("gsk_***"),
            "expected redacted key in report:\n{report}"
        );
        assert!(
            !report.contains("gsk_abc123XYZ"),
            "raw Groq key leaked in report:\n{report}"
        );
    }

    #[test]
    fn caps_log_tail_at_200_lines() {
        let dir = temp_logs();
        let mut body = String::new();
        for i in 1..=250 {
            body.push_str(&format!("LOG_LINE_{i:03}\n"));
        }
        fs::write(dir.join(LOG_FILE), body).expect("write log");

        let report = collect_diagnostics_report(&dir, &sample_info());
        assert!(
            report.contains("LOG_LINE_051"),
            "expected first kept line:\n{report}"
        );
        assert!(
            report.contains("LOG_LINE_250"),
            "expected last line:\n{report}"
        );
        assert!(
            !report.contains("LOG_LINE_050"),
            "line 50 should be dropped by the 200-line cap:\n{report}"
        );
    }

    #[test]
    fn reports_previous_session_from_info_not_current_marker() {
        let dir = temp_logs();
        session::begin_session(&dir, "0.17.5", 1);
        let report = collect_diagnostics_report(&dir, &sample_info());
        assert!(
            report.contains("previous_session: clean"),
            "report must use captured previous_session, not the current unclean marker:\n{report}"
        );
    }
}
