//! Durable replacement without truncating the last good file.
use anyhow::Result;
use std::{fs::{self, OpenOptions}, io::Write, path::Path};

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or_else(|| anyhow::anyhow!("File has no parent"))?;
    let temporary = parent.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace(&temporary, path)?;
        #[cfg(not(windows))]
        fs::File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[cfg(not(windows))]
fn replace(source: &Path, target: &Path) -> Result<()> {
    fs::rename(source, target)?;
    Ok(())
}

#[cfg(windows)]
fn replace(source: &Path, target: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR, Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH}};
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe { MoveFileExW(PCWSTR(source.as_ptr()), PCWSTR(target.as_ptr()), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)?; }
    Ok(())
}
