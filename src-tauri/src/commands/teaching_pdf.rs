use serde::{Deserialize, Serialize};

/// On-disk Teaching PDF library entry (camelCase JSON unchanged).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeachingPdfEntry {
    pub id: String,
    pub title: String,
    pub path: String,
    pub last_opened_at: String,
}

#[tauri::command]
pub fn cmd_export_teaching_reach_pdf(
    app: tauri::AppHandle,
    source_path: String,
    from_page: u32,
    to_page: u32,
    dest_path: String,
) -> Result<crate::teaching_pdf_reach::ReachExportResult, String> {
    crate::teaching_pdf_reach::export_reach_pdf(&app, &source_path, from_page, to_page, &dest_path)
}

#[tauri::command]
pub fn cmd_read_teaching_pdf(
    app: tauri::AppHandle,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = crate::teaching_pdf::read_teaching_pdf_bytes(&app, &path)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn cmd_list_teaching_pdfs(app: tauri::AppHandle) -> Result<Vec<TeachingPdfEntry>, String> {
    let values = crate::teaching_pdf::list_teaching_pdfs(&app)?;
    values
        .into_iter()
        .map(|v| {
            serde_json::from_value(v)
                .map_err(|e| format!("Teaching PDF library entry is invalid: {e}"))
        })
        .collect()
}

#[tauri::command]
pub fn cmd_save_teaching_pdfs(
    app: tauri::AppHandle,
    entries: Vec<TeachingPdfEntry>,
) -> Result<(), String> {
    let list = entries
        .into_iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    crate::teaching_pdf::save_teaching_pdfs(&app, list)
}

#[tauri::command]
pub fn cmd_ensure_teaching_reach_pdf(
    app: tauri::AppHandle,
    original_path: String,
) -> Result<crate::teaching_pdf_reach::ReachPathResult, String> {
    crate::teaching_pdf_reach::ensure_reach_pdf(&app, &original_path)
}

#[tauri::command]
pub fn cmd_read_teaching_reach_annotations(
    app: tauri::AppHandle,
    path: String,
) -> Result<crate::teaching_pdf_reach::ReachAnnotationsResult, String> {
    crate::teaching_pdf_reach::read_reach_annotations(&app, &path)
}

#[tauri::command]
pub fn cmd_write_teaching_reach_annotations(
    app: tauri::AppHandle,
    path: String,
    json: String,
) -> Result<crate::teaching_pdf_reach::ReachPathResult, String> {
    crate::teaching_pdf_reach::write_reach_annotations(&app, &path, &json)
}

#[tauri::command]
pub fn cmd_delete_teaching_reach_pdf(
    app: tauri::AppHandle,
    path: String,
) -> Result<crate::teaching_pdf_reach::ReachDeleteResult, String> {
    crate::teaching_pdf_reach::delete_reach_pdf(&app, &path)
}
