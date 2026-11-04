//! In-memory scrubbed diagnostics zip for "Send logs".

use super::crash::KEEP_CRASH_SIDECARS;
use super::report::{collect_diagnostics_report, DiagnosticsInfo};
use super::session::{BREADCRUMBS_FILE, LOG_FILE, MARKER_FILE};
use crate::logging::redact;
use serde::Serialize;
use std::fs;
use std::io::{Cursor, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

pub const MAX_ZIP_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_NOTE_CHARS: usize = 1000;

pub struct BundleOptions<'a> {
    pub logs_dir: &'a Path,
    pub info: &'a DiagnosticsInfo,
    pub note: Option<&'a str>,
    pub username: &'a str,
    pub user_profile: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BundleFile {
    pub name: String,
    pub size: u64,
}

pub struct DiagnosticsBundle {
    pub zip_bytes: Vec<u8>,
    pub files: Vec<BundleFile>,
}

#[derive(Clone)]
struct PendingFile {
    name: String,
    body: Vec<u8>,
}

pub fn build_diagnostics_bundle(opts: &BundleOptions<'_>) -> Result<DiagnosticsBundle, String> {
    let mut files = collect_log_files(opts)?;
    let mut drops: Vec<String> = Vec::new();
    let report = scrub_text(
        &collect_diagnostics_report(opts.logs_dir, opts.info),
        opts.username,
        opts.user_profile,
    );

    loop {
        let mut with_report = Vec::with_capacity(files.len() + 1);
        with_report.push(PendingFile {
            name: "diagnostics.txt".into(),
            body: diagnostics_text(&report, &drops).into_bytes(),
        });
        with_report.extend(files.iter().cloned());

        let zip_bytes = write_zip(&with_report)?;
        if zip_bytes.len() <= MAX_ZIP_BYTES {
            let files = with_report
                .iter()
                .map(|file| BundleFile {
                    name: file.name.clone(),
                    size: file.body.len() as u64,
                })
                .collect();
            return Ok(DiagnosticsBundle { zip_bytes, files });
        }

        if let Some(index) = oldest_rotated_index(&files) {
            drops.push(format!("dropped: {}", files[index].name));
            files.remove(index);
            continue;
        }

        if truncate_largest_log(&mut files, &mut drops) {
            continue;
        }

        return Err("diagnostics zip still exceeds 5 MB after dropping logs".into());
    }
}

fn collect_log_files(opts: &BundleOptions<'_>) -> Result<Vec<PendingFile>, String> {
    let mut files = Vec::new();
    push_if_present(&mut files, opts, LOG_FILE)?;
    push_rotated_logs(&mut files, opts)?;
    push_if_present(&mut files, opts, BREADCRUMBS_FILE)?;
    push_crash_sidecars(&mut files, opts)?;
    push_if_present(&mut files, opts, MARKER_FILE)?;
    if let Some(note) = opts.note.map(str::trim).filter(|note| !note.is_empty()) {
        let clipped: String = note.chars().take(MAX_NOTE_CHARS).collect();
        files.push(PendingFile {
            name: "note.txt".into(),
            body: scrub_text(&clipped, opts.username, opts.user_profile).into_bytes(),
        });
    }
    Ok(files)
}

fn push_if_present(
    files: &mut Vec<PendingFile>,
    opts: &BundleOptions<'_>,
    name: &str,
) -> Result<(), String> {
    let path = opts.logs_dir.join(name);
    if !path.is_file() {
        return Ok(());
    }
    files.push(PendingFile {
        name: name.to_string(),
        body: read_scrubbed(&path, opts)?,
    });
    Ok(())
}

fn push_rotated_logs(files: &mut Vec<PendingFile>, opts: &BundleOptions<'_>) -> Result<(), String> {
    let mut rotated = list_dir_files(opts.logs_dir)?
        .into_iter()
        .filter(|name| rotated_log_stamp(name).is_some())
        .collect::<Vec<_>>();
    rotated.sort_by(|a, b| rotated_log_stamp(b).cmp(&rotated_log_stamp(a)));
    for name in rotated {
        let path = opts.logs_dir.join(&name);
        files.push(PendingFile {
            name,
            body: read_scrubbed(&path, opts)?,
        });
    }
    Ok(())
}

fn push_crash_sidecars(
    files: &mut Vec<PendingFile>,
    opts: &BundleOptions<'_>,
) -> Result<(), String> {
    let mut crashes = list_dir_files(opts.logs_dir)?
        .into_iter()
        .filter(|name| name.starts_with("crash-") && name.ends_with(".txt"))
        .collect::<Vec<_>>();
    crashes.sort();
    crashes.reverse();
    crashes.truncate(KEEP_CRASH_SIDECARS);
    for name in crashes {
        let path = opts.logs_dir.join(&name);
        files.push(PendingFile {
            name,
            body: read_scrubbed(&path, opts)?,
        });
    }
    Ok(())
}

fn list_dir_files(dir: &Path) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(names),
        Err(err) => return Err(format!("read logs dir: {err}")),
    };
    for entry in entries {
        let entry = entry.map_err(|err| format!("read logs dir: {err}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

fn read_scrubbed(path: &Path, opts: &BundleOptions<'_>) -> Result<Vec<u8>, String> {
    let raw = fs::read(path).map_err(|err| format!("read {}: {err}", path.display()))?;
    let text = String::from_utf8_lossy(&raw);
    Ok(scrub_text(&text, opts.username, opts.user_profile).into_bytes())
}

fn scrub_text(text: &str, username: &str, user_profile: &str) -> String {
    let redacted = redact(text);
    scrub_user_paths(&redacted, username, user_profile)
}

pub(crate) fn scrub_user_paths(text: &str, username: &str, user_profile: &str) -> String {
    let mut out = text.to_string();
    let profile = user_profile.trim_end_matches(['\\', '/']);
    if !profile.is_empty() {
        let forward = profile.replace('\\', "/");
        out = replace_ascii_ignore_case(&out, profile, "%USERPROFILE%");
        if forward != profile {
            out = replace_ascii_ignore_case(&out, &forward, "%USERPROFILE%");
        }
    }
    if !username.is_empty() {
        let win = format!(r"C:\Users\{username}");
        let fwd = format!("C:/Users/{username}");
        out = replace_ascii_ignore_case(&out, &win, "%USERPROFILE%");
        out = replace_ascii_ignore_case(&out, &fwd, "%USERPROFILE%");
        out = replace_username_token(&out, username, r"%USERPROFILE%\");
    }
    out
}

fn replace_ascii_ignore_case(haystack: &str, needle: &str, replacement: &str) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }
    let lower_h = haystack.to_ascii_lowercase();
    let lower_n = needle.to_ascii_lowercase();
    let mut out = String::with_capacity(haystack.len());
    let mut last = 0;
    let mut search = 0;
    while let Some(idx) = lower_h[search..].find(&lower_n) {
        let abs = search + idx;
        out.push_str(&haystack[last..abs]);
        out.push_str(replacement);
        last = abs + needle.len();
        search = last;
    }
    out.push_str(&haystack[last..]);
    out
}

fn replace_username_token(text: &str, username: &str, replacement: &str) -> String {
    if username.is_empty() {
        return text.to_string();
    }
    let lower_h = text.to_ascii_lowercase();
    let lower_n = username.to_ascii_lowercase();
    let chars: Vec<char> = text.chars().collect();
    let lower_chars: Vec<char> = lower_h.chars().collect();
    let needle: Vec<char> = lower_n.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if i + needle.len() <= chars.len()
            && lower_chars[i..i + needle.len()] == needle[..]
            && !is_ident_char(chars.get(i.wrapping_sub(1)).copied())
            && !is_ident_char(chars.get(i + needle.len()).copied())
        {
            out.push_str(replacement);
            i += needle.len();
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn is_ident_char(ch: Option<char>) -> bool {
    ch.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn diagnostics_text(report: &str, drops: &[String]) -> String {
    if drops.is_empty() {
        return report.to_string();
    }
    let mut out = report.to_string();
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.push('\n');
    out.push_str("--- size cap ---\n");
    for drop in drops {
        out.push_str(drop);
        out.push('\n');
    }
    out
}

fn write_zip(files: &[PendingFile]) -> Result<Vec<u8>, String> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for file in files {
        zip.start_file(&file.name, options)
            .map_err(|err| format!("zip start {}: {err}", file.name))?;
        zip.write_all(&file.body)
            .map_err(|err| format!("zip write {}: {err}", file.name))?;
    }
    let buf = zip.finish().map_err(|err| format!("zip finish: {err}"))?;
    Ok(buf.into_inner())
}

/// tauri-plugin-log KeepSome names rotated files `reach-panel_<YYYY-MM-DD_HH-MM-SS>.log`.
fn rotated_log_stamp(name: &str) -> Option<&str> {
    let stamp = name.strip_prefix("reach-panel_")?.strip_suffix(".log")?;
    (stamp.len() == 19).then_some(stamp)
}

fn oldest_rotated_index(files: &[PendingFile]) -> Option<usize> {
    files
        .iter()
        .enumerate()
        .filter_map(|(index, file)| rotated_log_stamp(&file.name).map(|stamp| (index, stamp)))
        .min_by(|a, b| a.1.cmp(b.1))
        .map(|(index, _)| index)
}

fn truncate_largest_log(files: &mut Vec<PendingFile>, drops: &mut Vec<String>) -> bool {
    let Some(index) = files
        .iter()
        .enumerate()
        .filter(|(_, file)| {
            file.name == "reach-panel.log" || rotated_log_stamp(&file.name).is_some()
        })
        .max_by_key(|(_, file)| file.body.len())
        .map(|(index, _)| index)
    else {
        return false;
    };
    let file = &mut files[index];
    if file.body.is_empty() {
        drops.push(format!("dropped: {}", file.name));
        files.remove(index);
        return true;
    }
    let keep = (file.body.len() / 2).max(1);
    if keep >= file.body.len() {
        drops.push(format!("dropped: {}", file.name));
        files.remove(index);
        return true;
    }
    let start = file.body.len() - keep;
    let text = String::from_utf8_lossy(&file.body);
    let cut = text
        .char_indices()
        .map(|(i, _)| i)
        .find(|i| *i >= start)
        .unwrap_or(text.len());
    file.body = text[cut..].as_bytes().to_vec();
    drops.push(format!(
        "truncated: {} (kept last {} bytes)",
        files[index].name,
        files[index].body.len()
    ));
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::session::{BREADCRUMBS_FILE, LOG_FILE, MARKER_FILE};
    use rand::RngCore;
    use std::fs;
    use std::io::{Cursor, Read};
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    const USER: &str = "alice";
    const PROFILE: &str = r"C:\Users\alice";

    fn temp_logs() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("reach-panel-bundle-test-{nanos}"));
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

    fn build(dir: &Path) -> DiagnosticsBundle {
        build_diagnostics_bundle(&BundleOptions {
            logs_dir: dir,
            info: &sample_info(),
            note: None,
            username: USER,
            user_profile: PROFILE,
        })
        .expect("bundle")
    }

    fn zip_entries(bytes: &[u8]) -> Vec<(String, String)> {
        let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("open zip");
        let mut out = Vec::new();
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).expect("entry");
            let name = file.name().to_string();
            let mut raw = Vec::new();
            file.read_to_end(&mut raw).expect("read entry");
            out.push((name, String::from_utf8_lossy(&raw).into_owned()));
        }
        out
    }

    fn incompressible(len: usize) -> Vec<u8> {
        let mut buf = vec![0u8; len];
        rand::thread_rng().fill_bytes(&mut buf);
        buf
    }

    #[test]
    fn redacts_gsk_token_in_zip_entries() {
        let dir = temp_logs();
        fs::write(
            dir.join(LOG_FILE),
            "ok line\nAuthorization: Bearer gsk_abc123XYZ\n",
        )
        .expect("write log");
        fs::write(dir.join(BREADCRUMBS_FILE), "layout ratio=0.5\n").expect("breadcrumbs");
        fs::write(dir.join(MARKER_FILE), "{\"clean_exit\":true}\n").expect("session");

        let bundle = build(&dir);
        let entries = zip_entries(&bundle.zip_bytes);
        assert!(
            entries.iter().any(|(name, _)| name == "diagnostics.txt"),
            "missing diagnostics.txt: {:?}",
            entries.iter().map(|(n, _)| n).collect::<Vec<_>>()
        );
        for (name, body) in &entries {
            assert!(
                !body.contains("gsk_abc123XYZ"),
                "raw Groq key leaked in {name}:\n{body}"
            );
        }
        let joined = entries
            .iter()
            .map(|(_, body)| body.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(
            joined.contains("gsk_***"),
            "expected redacted key in bundle:\n{joined}"
        );
    }

    #[test]
    fn strips_user_profile_paths_from_every_entry() {
        let dir = temp_logs();
        let leaked = format!(
            r"panic at {PROFILE}\AppData\Local\com.nik.reach-panel\logs\reach-panel.log user={USER} also C:/Users/{USER}/foo"
        );
        fs::write(dir.join(LOG_FILE), &leaked).expect("write log");
        fs::write(dir.join(BREADCRUMBS_FILE), &leaked).expect("breadcrumbs");
        fs::write(
            dir.join(MARKER_FILE),
            format!("{{\"path\":\"{PROFILE}\\\\logs\"}}"),
        )
        .expect("session");
        fs::write(dir.join("crash-20260101T000000.000Z.txt"), &leaked).expect("crash");

        let bundle = build(&dir);
        let entries = zip_entries(&bundle.zip_bytes);
        assert!(!entries.is_empty(), "expected zip entries");
        for (name, body) in &entries {
            assert!(
                !body.contains(PROFILE),
                "raw profile path in {name}:\n{body}"
            );
            assert!(
                !body.contains(&format!(r"C:\Users\{USER}")),
                "backslash profile in {name}:\n{body}"
            );
            assert!(
                !body.contains(&format!("C:/Users/{USER}")),
                "forward-slash profile in {name}:\n{body}"
            );
            let bare = format!("user={USER}");
            assert!(
                !body.contains(&bare),
                "bare user name left in {name}:\n{body}"
            );
        }
    }

    #[test]
    fn five_mb_cap_drops_oldest_rotated_logs_and_records_it() {
        let dir = temp_logs();
        fs::write(dir.join(LOG_FILE), "current-log-tail\n").expect("current log");
        fs::write(
            dir.join("reach-panel_2026-11-02_10-00-00.log"),
            incompressible(3_200_000),
        )
        .expect("newer rotated");
        fs::write(
            dir.join("reach-panel_2026-11-01_10-00-00.log"),
            incompressible(3_200_000),
        )
        .expect("older rotated");
        fs::write(dir.join(BREADCRUMBS_FILE), "layout ratio=0.5\n").expect("breadcrumbs");
        fs::write(dir.join(MARKER_FILE), "{\"clean_exit\":true}\n").expect("session");

        let bundle = build(&dir);
        assert!(
            bundle.zip_bytes.len() <= MAX_ZIP_BYTES,
            "zip was {} bytes",
            bundle.zip_bytes.len()
        );

        let names: Vec<String> = bundle.files.iter().map(|f| f.name.clone()).collect();
        assert!(
            !names
                .iter()
                .any(|n| n == "reach-panel_2026-11-01_10-00-00.log"),
            "oldest rotated log should be dropped: {names:?}"
        );

        let entries = zip_entries(&bundle.zip_bytes);
        let diagnostics = entries
            .iter()
            .find(|(name, _)| name == "diagnostics.txt")
            .map(|(_, body)| body.as_str())
            .expect("diagnostics.txt");
        assert!(
            diagnostics.contains("reach-panel_2026-11-01_10-00-00.log"),
            "dropped file must be listed in diagnostics.txt:\n{diagnostics}"
        );
        assert!(
            diagnostics.to_ascii_lowercase().contains("drop"),
            "diagnostics.txt should say something was dropped:\n{diagnostics}"
        );
    }
}
