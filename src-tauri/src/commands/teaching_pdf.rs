use serde::{Deserialize, Serialize};

/// On-disk Teaching PDF library entry (camelCase JSON unchanged).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeachingPdfEntry {
    pub id: String,
    #[serde(default)]
    pub title: String,
    pub path: String,
    #[serde(default)]
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

/// Parse stored library values, skipping entries that don't match the schema
/// (matches the frontend's previous tolerant filter instead of failing the whole list).
fn entries_from_values(values: Vec<serde_json::Value>) -> Vec<TeachingPdfEntry> {
    values
        .into_iter()
        .filter_map(|v| match serde_json::from_value::<TeachingPdfEntry>(v) {
            Ok(entry) => Some(entry),
            Err(e) => {
                eprintln!("Skipping invalid Teaching PDF library entry: {e}");
                None
            }
        })
        .collect()
}

#[tauri::command]
pub fn cmd_list_teaching_pdfs(app: tauri::AppHandle) -> Result<Vec<TeachingPdfEntry>, String> {
    Ok(entries_from_values(crate::teaching_pdf::list_teaching_pdfs(
        &app,
    )?))
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

#[cfg(test)]
mod tests {
    use super::{entries_from_values, TeachingPdfEntry};
    use serde_json::json;

    #[test]
    fn teaching_pdf_entry_round_trips_camel_case_json() {
        let on_disk = json!({
            "id": "a",
            "title": "a.pdf",
            "path": "C:\\docs\\a.pdf",
            "lastOpenedAt": "2026-01-01T00:00:00.000Z"
        });
        let entry: TeachingPdfEntry = serde_json::from_value(on_disk.clone()).unwrap();
        assert_eq!(entry.last_opened_at, "2026-01-01T00:00:00.000Z");
        assert_eq!(serde_json::to_value(&entry).unwrap(), on_disk);
    }

    #[test]
    fn invalid_entries_are_skipped_not_fatal() {
        let values = vec![
            json!({ "id": "ok", "title": "ok.pdf", "path": "C:\\ok.pdf", "lastOpenedAt": "x" }),
            json!({ "id": "partial", "path": "C:\\partial.pdf" }),
            json!({ "title": "no-id-or-path.pdf" }),
            json!("not an object"),
        ];
        let entries = entries_from_values(values);
        let ids: Vec<_> = entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["ok", "partial"]);
        assert_eq!(entries[1].title, "");
    }
}
