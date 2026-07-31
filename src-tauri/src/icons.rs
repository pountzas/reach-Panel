//! Resolve and extract icons for Quick Actions (Windows app icons).

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Returns a filesystem path to a cached PNG icon for `convertFileSrc`, or `None`.
pub fn app_icon_cached_path(app: &AppHandle, target: &str) -> Option<String> {
    #[cfg(windows)]
    {
        let path = resolve_app_path(target)?;
        let cache_dir = icon_cache_dir(app).ok()?;
        let key = icon_cache_key(&path);
        let cache_file = cache_dir.join(format!("{key}.png"));
        if cache_file.is_file() {
            return Some(cache_file.to_string_lossy().into_owned());
        }
        let png = extract_file_icon_png(&path).ok()?;
        fs::write(&cache_file, png).ok()?;
        Some(cache_file.to_string_lossy().into_owned())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, target);
        None
    }
}

/// True when the app target resolves to an existing executable on this machine.
pub fn is_app_installed(target: &str) -> bool {
    #[cfg(windows)]
    {
        resolve_app_path(target).is_some()
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        false
    }
}

/// Resolve a quick-action app target to an existing `.exe` path when possible.
pub fn resolve_launch_app_path(target: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        resolve_app_path(target)
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        None
    }
}

fn icon_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("icon-cache");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn icon_cache_key(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    if let Ok(meta) = fs::metadata(path) {
        if let Ok(modified) = meta.modified() {
            modified.hash(&mut hasher);
        }
        meta.len().hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

#[cfg(windows)]
fn resolve_app_path(target: &str) -> Option<PathBuf> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return None;
    }

    let direct = PathBuf::from(trimmed);
    if direct.is_file() {
        return Some(direct);
    }

    if trimmed.contains('\\') || trimmed.contains('/') {
        return None;
    }

    let lower = trimmed.to_ascii_lowercase();
    let exe = if lower.ends_with(".exe") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.exe")
    };

    if let Ok(path_env) = std::env::var("PATH") {
        for dir in path_env.split(';') {
            if dir.is_empty() {
                continue;
            }
            let candidate = PathBuf::from(dir).join(&exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Some(from_reg) = resolve_from_app_paths_registry(&exe) {
        return Some(from_reg);
    }

    // Common install locations for short names that are not always on PATH.
    for candidate in known_install_candidates(&lower) {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

#[cfg(windows)]
fn known_install_candidates(lower_target: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let pf = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let pf86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);

    let is_spotify = lower_target == "spotify" || lower_target == "spotify.exe";
    let is_teamspeak = lower_target.contains("teamspeak")
        || lower_target == "ts3client_win64"
        || lower_target == "ts3client_win64.exe"
        || lower_target == "ts3client_win32"
        || lower_target == "ts3client_win32.exe";

    if is_spotify {
        if let Some(local) = &local {
            out.push(local.join("Microsoft\\WindowsApps\\Spotify.exe"));
            out.push(local.join("Spotify\\Spotify.exe"));
        }
    }

    if is_teamspeak {
        for root in [&pf, &pf86] {
            if let Some(root) = root {
                out.push(root.join("TeamSpeak 3 Client\\ts3client_win64.exe"));
                out.push(root.join("TeamSpeak 3 Client\\ts3client_win32.exe"));
                out.push(root.join("TeamSpeak\\TeamSpeak.exe"));
            }
        }
    }

    out
}

#[cfg(windows)]
fn resolve_from_app_paths_registry(exe_name: &str) -> Option<PathBuf> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ,
    };

    let subkey = format!(
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{exe_name}"
    );
    let subkey_wide: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let mut hkey = Default::default();
        let open = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(subkey_wide.as_ptr()),
            0,
            KEY_READ,
            &mut hkey,
        );
        if open != ERROR_SUCCESS {
            return None;
        }

        let mut data = vec![0u16; 512];
        let mut data_bytes = (data.len() * 2) as u32;
        let mut data_type = REG_SZ;
        let query = RegQueryValueExW(
            hkey,
            PCWSTR::null(),
            None,
            Some(&mut data_type),
            Some(data.as_mut_ptr() as *mut u8),
            Some(&mut data_bytes),
        );
        let _ = RegCloseKey(hkey);
        if query != ERROR_SUCCESS {
            return None;
        }

        let len = (data_bytes as usize / 2).saturating_sub(1);
        let path = String::from_utf16_lossy(&data[..len]);
        let path = path.trim_matches('"').trim();
        let pb = PathBuf::from(path);
        if pb.is_file() {
            Some(pb)
        } else {
            None
        }
    }
}

#[cfg(windows)]
fn extract_file_icon_png(path: &Path) -> Result<Vec<u8>, String> {
    use image::{ImageBuffer, ImageFormat, Rgba};
    use std::io::Cursor;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::UI::Shell::ExtractIconExW;
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL, HICON};

    const SIZE: i32 = 48;

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut large = HICON::default();
        let count = ExtractIconExW(
            PCWSTR(wide.as_ptr()),
            0,
            Some(&mut large),
            None,
            1,
        );
        if count == 0 || large.is_invalid() {
            return Err("ExtractIconExW failed".into());
        }
        let hicon = large;

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: SIZE,
                biHeight: -SIZE, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            bmiColors: [Default::default()],
        };

        let hdc = CreateCompatibleDC(None);
        if hdc.is_invalid() {
            let _ = DestroyIcon(hicon);
            return Err("CreateCompatibleDC failed".into());
        }

        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let hbmp = CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
            .map_err(|e| e.to_string())?;
        if hbmp.is_invalid() || bits.is_null() {
            let _ = DeleteDC(hdc);
            let _ = DestroyIcon(hicon);
            return Err("CreateDIBSection failed".into());
        }

        let old = SelectObject(hdc, HGDIOBJ(hbmp.0));
        let drawn = DrawIconEx(hdc, 0, 0, hicon, SIZE, SIZE, 0, None, DI_NORMAL);
        SelectObject(hdc, old);
        let _ = DeleteDC(hdc);
        let _ = DestroyIcon(hicon);

        if drawn.is_err() {
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
            return Err("DrawIconEx failed".into());
        }

        let pixel_count = (SIZE * SIZE) as usize;
        let raw = std::slice::from_raw_parts(bits as *const u8, pixel_count * 4);
        // Windows DIB is BGRA; image crate wants RGBA.
        let mut rgba = Vec::with_capacity(pixel_count * 4);
        for px in raw.chunks_exact(4) {
            rgba.push(px[2]); // R
            rgba.push(px[1]); // G
            rgba.push(px[0]); // B
            rgba.push(px[3]); // A
        }

        let _ = DeleteObject(HGDIOBJ(hbmp.0));

        let img: ImageBuffer<Rgba<u8>, _> =
            ImageBuffer::from_raw(SIZE as u32, SIZE as u32, rgba)
                .ok_or_else(|| "Failed to build image buffer".to_string())?;
        let mut png_bytes = Cursor::new(Vec::new());
        img.write_to(&mut png_bytes, ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(png_bytes.into_inner())
    }
}
