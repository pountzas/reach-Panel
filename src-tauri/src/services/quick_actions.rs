use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Accepts host-shaped targets like `example.com`, `example.com:443/path?q=1`.
fn is_host_shaped_url_target(trimmed: &str) -> bool {
    if trimmed.contains('\\') || trimmed.contains("://") {
        return false;
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || ".-:_/?#=&%+".contains(c))
    {
        return false;
    }

    let host_port = trimmed
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(trimmed);
    if host_port.is_empty() {
        return false;
    }

    let host = if let Some((name, port)) = host_port.rsplit_once(':') {
        if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        name
    } else {
        host_port
    };

    let labels: Vec<&str> = host.split('.').collect();
    labels.len() >= 2
        && labels.iter().all(|label| {
            !label.is_empty()
                && label
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
}

pub fn validate_quick_action_url(target: &str) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("URL target is empty".to_string());
    }
    if trimmed.contains('\0') {
        return Err("URL target is invalid".to_string());
    }

    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:")
        || lower.starts_with("ms-settings:")
    {
        return Ok(trimmed.to_string());
    }

    if is_host_shaped_url_target(trimmed) {
        return Ok(format!("https://{trimmed}"));
    }

    Err("URL scheme not allowed".to_string())
}

pub fn validate_quick_action_app(target: &str) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("App target is empty".to_string());
    }
    if trimmed.contains('\0') || trimmed.contains("..") {
        return Err("App target is invalid".to_string());
    }

    let lower = trimmed.to_ascii_lowercase();
    const BLOCKED_SUFFIXES: &[&str] = &[
        ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".msi", ".scr", ".com", ".lnk",
    ];
    for suffix in BLOCKED_SUFFIXES {
        if lower.ends_with(suffix) {
            return Err("Executable type not allowed".to_string());
        }
    }

    if trimmed.contains('\\') || trimmed.contains('/') {
        if !lower.ends_with(".exe") {
            return Err("Only .exe app paths are allowed".to_string());
        }
        let path = std::path::PathBuf::from(trimmed);
        if !path.is_file() {
            return Err("Application not found".to_string());
        }
        return Ok(trimmed.to_string());
    }

    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err("Invalid app name".to_string());
    }

    if let Some(resolved) = crate::icons::resolve_launch_app_path(trimmed) {
        return Ok(resolved.to_string_lossy().into_owned());
    }

    let path = if lower.ends_with(".exe") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.exe")
    };
    Err(format!("Application not found: {path}"))
}

pub fn launch_quick_action(
    app: &AppHandle,
    action_type: &str,
    target: &str,
) -> Result<(), String> {
    match action_type {
        "url" => {
            let url = validate_quick_action_url(target)?;
            app.opener()
                .open_url(&url, None::<&str>)
                .map_err(|e| e.to_string())?;
        }
        "app" => {
            let path = validate_quick_action_app(target)?;
            app.opener()
                .open_path(&path, None::<&str>)
                .map_err(|e| e.to_string())?;
        }
        _ => return Err("Unknown action type".to_string()),
    }
    Ok(())
}
