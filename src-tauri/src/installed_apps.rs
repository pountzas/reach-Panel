//! Enumerate installed Windows apps from Start Menu shortcuts.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

/// Lists installed apps discovered via Start Menu `.lnk` shortcuts.
pub fn list_installed_apps() -> Result<Vec<InstalledApp>, String> {
    list_installed_apps_windows()
}

#[cfg(windows)]
fn list_installed_apps_windows() -> Result<Vec<InstalledApp>, String> {
    use windows::core::GUID;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};

    // CLSID_ShellLink
    const CLSID_SHELL_LINK: GUID = GUID::from_u128(0x0002_1401_0000_0000_C000_000000000046);

    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    // S_OK (0) or S_FALSE (1 = already initialized) are fine.
    let should_uninit = hr.is_ok() || hr.0 == 1;

    let mut by_path: BTreeMap<String, (String, String)> = BTreeMap::new();

    for root in start_menu_roots() {
        if !root.is_dir() {
            continue;
        }
        collect_lnk_files(&root, &mut |lnk| {
            let Some(name) = lnk
                .file_stem()
                .and_then(|s| s.to_str())
                .map(str::to_string)
            else {
                return;
            };
            if is_junk_shortcut_name(&name) {
                return;
            }
            let Ok(target) = resolve_shortcut_target(lnk, CLSID_SHELL_LINK) else {
                return;
            };
            if !is_launchable_exe(&target) {
                return;
            }
            let path_key = target.to_ascii_lowercase();
            by_path.entry(path_key).or_insert((name, target));
        });
    }

    if should_uninit {
        unsafe {
            CoUninitialize();
        }
    }

    let mut apps: Vec<InstalledApp> = by_path
        .into_values()
        .map(|(name, path)| InstalledApp { name, path })
        .collect();
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}

#[cfg(windows)]
fn start_menu_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(program_data) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(app_data) = std::env::var("AppData") {
        roots.push(PathBuf::from(app_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    roots
}

#[cfg(windows)]
fn collect_lnk_files(dir: &Path, on_lnk: &mut dyn FnMut(&Path)) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let folder = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if matches!(
                folder.as_str(),
                "startup" | "administrative tools" | "windows powershell" | "system tools"
            ) {
                continue;
            }
            collect_lnk_files(&path, on_lnk);
        } else if path
            .extension()
            .and_then(|s| s.to_str())
            .map(|e| e.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
        {
            on_lnk(&path);
        }
    }
}

#[cfg(windows)]
fn is_junk_shortcut_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("uninstall")
        || lower.contains("readme")
        || lower.contains("release notes")
        || lower.contains("documentation")
}

#[cfg(windows)]
fn is_launchable_exe(path: &str) -> bool {
    let p = Path::new(path);
    if !p.is_file() {
        return false;
    }
    let Some(ext) = p.extension().and_then(|s| s.to_str()) else {
        return false;
    };
    if !ext.eq_ignore_ascii_case("exe") {
        return false;
    }
    let file = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    !file.contains("uninstall") && !file.starts_with("unins") && file != "setup" && file != "install"
}

#[cfg(windows)]
fn resolve_shortcut_target(
    lnk: &Path,
    clsid: windows::core::GUID,
) -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, SLGP_RAWPATH};

    unsafe {
        let shell_link: IShellLinkW =
            CoCreateInstance(&clsid, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let persist: IPersistFile = shell_link.cast().map_err(|e| e.to_string())?;

        let wide: Vec<u16> = lnk
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        persist
            .Load(PCWSTR(wide.as_ptr()), STGM(0))
            .map_err(|e| e.to_string())?;

        let mut buffer = vec![0u16; 520];
        shell_link
            .GetPath(&mut buffer, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32)
            .map_err(|e| e.to_string())?;

        let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        let path = String::from_utf16_lossy(&buffer[..len]);
        if path.is_empty() {
            return Err("empty shortcut target".into());
        }
        Ok(path)
    }
}
