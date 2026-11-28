use crate::install_prefs::{read_install_prefs, write_install_prefs};
use tauri::AppHandle;

#[tauri::command]
pub fn cmd_get_focus_mode_hidden_tip_dismissed(app: AppHandle) -> Result<bool, String> {
    Ok(read_install_prefs(&app)?.focus_mode_hidden_tip_dismissed)
}

#[tauri::command]
pub fn cmd_set_focus_mode_hidden_tip_dismissed(
    app: AppHandle,
    dismissed: bool,
) -> Result<(), String> {
    let mut prefs = read_install_prefs(&app)?;
    prefs.focus_mode_hidden_tip_dismissed = dismissed;
    write_install_prefs(&app, &prefs)
}