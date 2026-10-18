//! Sibling `name.reach.pdf` with embedded `reach-annotations.json`.
//! Never writes or deletes the original `name.pdf`.

use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::teaching_pdf::{self, allow_teaching_pdf_read_path, path_is_allowed};
use crate::teaching_pdf_appearances::{
    apply_reach_appearances, filter_and_remap_annotations, parse_annotation_doc,
    serialize_annotation_doc,
};

const ATTACHMENT_NAME: &str = "reach-annotations.json";
const EMPTY_ANNOTATION_JSON: &str = r#"{"schemaVersion":1,"pages":{}}"#;
const REACH_SUFFIX: &str = ".reach.pdf";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachPathResult {
    pub reach_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance_warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachAnnotationsResult {
    pub json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachDeleteResult {
    pub deleted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachExportResult {
    pub dest_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance_warning: Option<String>,
}

fn path_ends_with_ignore_ascii_case(path: &Path, suffix: &str) -> bool {
    let s = path.to_string_lossy();
    s.to_ascii_lowercase()
        .ends_with(&suffix.to_ascii_lowercase())
}

pub fn is_reach_pdf_path(path: &Path) -> bool {
    path_ends_with_ignore_ascii_case(path, REACH_SUFFIX)
}

pub fn to_reach_pdf_path(path: &Path) -> PathBuf {
    if is_reach_pdf_path(path) {
        return path.to_path_buf();
    }
    let s = path.to_string_lossy();
    if s.to_ascii_lowercase().ends_with(".pdf") {
        let stem = &s[..s.len() - 4];
        return PathBuf::from(format!("{stem}{REACH_SUFFIX}"));
    }
    PathBuf::from(format!("{s}{REACH_SUFFIX}"))
}

pub fn to_original_pdf_path(path: &Path) -> PathBuf {
    if !is_reach_pdf_path(path) {
        return path.to_path_buf();
    }
    let s = path.to_string_lossy();
    let suffix_len = REACH_SUFFIX.len();
    // Preserve original casing of the path prefix; replace only the suffix.
    let end = s.len() - suffix_len;
    PathBuf::from(format!("{}.pdf", &s[..end]))
}

fn assert_allowed_pdf(app: &AppHandle, path: &Path) -> Result<PathBuf, String> {
    let candidate = path.to_path_buf();
    if candidate.to_string_lossy().contains('\0') {
        return Err("Teaching PDF path is invalid".to_string());
    }
    let ext_ok = candidate
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !ext_ok {
        return Err("Teaching PDF file type is not allowed".to_string());
    }

    let original = to_original_pdf_path(&candidate);
    let reach = to_reach_pdf_path(&candidate);

    // Prefer canonical of whichever exists; allow if original or reach is allowlisted.
    let check_one = |p: &Path| -> Result<bool, String> {
        if !p.exists() {
            // Allow non-existent reach when original is allowed (create path).
            if is_reach_pdf_path(p) {
                let orig = to_original_pdf_path(p);
                if let Ok(orig_can) = orig.canonicalize() {
                    return path_is_allowed(app, &orig_can, &orig);
                }
                return path_is_allowed(app, &orig, &orig);
            }
            return Ok(false);
        }
        let canonical = p
            .canonicalize()
            .map_err(|e| format!("Teaching PDF not found: {e}"))?;
        if path_is_allowed(app, &canonical, p)? {
            return Ok(true);
        }
        // Sibling of an allowed original.
        if is_reach_pdf_path(p) {
            let orig = to_original_pdf_path(p);
            if let Ok(orig_can) = orig.canonicalize() {
                return path_is_allowed(app, &orig_can, &orig);
            }
            return path_is_allowed(app, &orig, &orig);
        }
        // Original when user opened reach: allow if reach was allowlisted.
        if !is_reach_pdf_path(p) {
            let r = to_reach_pdf_path(p);
            if r.exists() {
                if let Ok(r_can) = r.canonicalize() {
                    if path_is_allowed(app, &r_can, &r)? {
                        return Ok(true);
                    }
                }
            }
        }
        Ok(false)
    };

    if check_one(&original)? || check_one(&reach)? || check_one(&candidate)? {
        if let Ok(c) = candidate.canonicalize() {
            return Ok(c);
        }
        return Ok(candidate);
    }
    Err("Teaching PDF path is not allowed".to_string())
}

fn load_doc(path: &Path) -> Result<Document, String> {
    Document::load(path).map_err(|e| format!("Failed to open reach PDF: {e}"))
}

fn save_doc(doc: &mut Document, path: &Path) -> Result<(), String> {
    // Never save to a path that is not a .reach.pdf
    if !is_reach_pdf_path(path) {
        return Err("Refusing to write original PDF".to_string());
    }
    doc.save(path)
        .map_err(|e| format!("Failed to save reach PDF: {e}"))?;
    Ok(())
}

fn attachment_name_matches(obj: &Object) -> bool {
    match obj {
        Object::String(bytes, _) => {
            let s = String::from_utf8_lossy(bytes);
            s.eq_ignore_ascii_case(ATTACHMENT_NAME)
        }
        Object::Name(bytes) => {
            let s = String::from_utf8_lossy(bytes);
            s.eq_ignore_ascii_case(ATTACHMENT_NAME)
        }
        _ => false,
    }
}

fn find_filespec_in_names_array(arr: &[Object]) -> Option<ObjectId> {
    let mut i = 0;
    while i + 1 < arr.len() {
        if attachment_name_matches(&arr[i]) {
            if let Ok(id) = arr[i + 1].as_reference() {
                return Some(id);
            }
        }
        i += 2;
    }
    None
}

fn extract_embedded_json(doc: &mut Document) -> Result<Option<String>, String> {
    let catalog_id = doc
        .trailer
        .get(b"Root")
        .map_err(|e| e.to_string())?
        .as_reference()
        .map_err(|e| e.to_string())?;
    let catalog = doc
        .get_object(catalog_id)
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|e| e.to_string())?;
    let Some(names_obj) = catalog.get(b"Names").ok() else {
        return Ok(None);
    };
    let names_id = match names_obj {
        Object::Reference(id) => *id,
        _ => return Ok(None),
    };
    let names_dict = doc
        .get_object(names_id)
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|e| e.to_string())?;
    let Some(ef_obj) = names_dict.get(b"EmbeddedFiles").ok() else {
        return Ok(None);
    };
    let ef_id = match ef_obj {
        Object::Reference(id) => *id,
        _ => return Ok(None),
    };
    let ef_dict = doc
        .get_object(ef_id)
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|e| e.to_string())?;
    let Some(names_arr_obj) = ef_dict.get(b"Names").ok() else {
        return Ok(None);
    };
    let names_arr = match names_arr_obj {
        Object::Array(a) => a,
        _ => return Ok(None),
    };
    let Some(filespec_id) = find_filespec_in_names_array(names_arr) else {
        return Ok(None);
    };
    let filespec = doc
        .get_object(filespec_id)
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|e| e.to_string())?;
    let ef = filespec
        .get(b"EF")
        .map_err(|e| e.to_string())?
        .as_dict()
        .map_err(|e| e.to_string())?;
    let stream_id = ef
        .get(b"F")
        .map_err(|e| e.to_string())?
        .as_reference()
        .map_err(|e| e.to_string())?;
    let stream = doc
        .get_object(stream_id)
        .map_err(|e| e.to_string())?
        .as_stream()
        .map_err(|e| e.to_string())?;
    let content = stream
        .decompressed_content()
        .unwrap_or_else(|_| stream.content.clone());
    String::from_utf8(content).map(Some).map_err(|e| e.to_string())
}

fn upsert_embedded_json(doc: &mut Document, json: &str) -> Result<(), String> {
    let data = json.as_bytes().to_vec();

    // If an existing attachment is found, replace its stream content in place.
    if let Ok(Some(_)) = extract_embedded_json(doc) {
        // Re-walk to get stream id (extract consumes borrows).
        let catalog_id = doc
            .trailer
            .get(b"Root")
            .map_err(|e| e.to_string())?
            .as_reference()
            .map_err(|e| e.to_string())?;
        let catalog = doc
            .get_object(catalog_id)
            .map_err(|e| e.to_string())?
            .as_dict()
            .map_err(|e| e.to_string())?;
        if let Ok(Object::Reference(names_id)) = catalog.get(b"Names") {
            let names_dict = doc
                .get_object(*names_id)
                .map_err(|e| e.to_string())?
                .as_dict()
                .map_err(|e| e.to_string())?;
            if let Ok(Object::Reference(ef_id)) = names_dict.get(b"EmbeddedFiles") {
                let ef_dict = doc
                    .get_object(*ef_id)
                    .map_err(|e| e.to_string())?
                    .as_dict()
                    .map_err(|e| e.to_string())?;
                if let Ok(Object::Array(names_arr)) = ef_dict.get(b"Names") {
                    if let Some(filespec_id) = find_filespec_in_names_array(names_arr) {
                        let filespec = doc
                            .get_object(filespec_id)
                            .map_err(|e| e.to_string())?
                            .as_dict()
                            .map_err(|e| e.to_string())?;
                        if let Ok(Object::Dictionary(ef)) = filespec.get(b"EF") {
                            if let Ok(Object::Reference(stream_id)) = ef.get(b"F") {
                                let stream_id = *stream_id;
                                let obj = doc
                                    .get_object_mut(stream_id)
                                    .map_err(|e| e.to_string())?;
                                if let Object::Stream(stream) = obj {
                                    stream.set_content(data);
                                    stream.dict.set("Length", Object::Integer(json.len() as i64));
                                    return Ok(());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Create new EmbeddedFile + Filespec + Names tree entry.
    let stream = Stream::new(
        dictionary! {
            "Type" => "EmbeddedFile",
            "Subtype" => Object::Name(b"application#2Fjson".to_vec()),
        },
        data,
    );
    let stream_id = doc.add_object(stream);
    let filespec_id = doc.add_object(dictionary! {
        "Type" => "Filespec",
        "F" => Object::string_literal(ATTACHMENT_NAME),
        "UF" => Object::string_literal(ATTACHMENT_NAME),
        "EF" => dictionary! {
            "F" => stream_id,
        },
    });
    let ef_tree_id = doc.add_object(dictionary! {
        "Names" => vec![
            Object::string_literal(ATTACHMENT_NAME),
            Object::Reference(filespec_id),
        ],
    });
    let names_id = doc.add_object(dictionary! {
        "EmbeddedFiles" => ef_tree_id,
    });

    let catalog_id = doc
        .trailer
        .get(b"Root")
        .map_err(|e| e.to_string())?
        .as_reference()
        .map_err(|e| e.to_string())?;
    let catalog = doc
        .get_object_mut(catalog_id)
        .map_err(|e| e.to_string())?
        .as_dict_mut()
        .map_err(|e| e.to_string())?;
    catalog.set("Names", Object::Reference(names_id));
    Ok(())
}

/// Copy original → sibling if missing; ensure empty JSON attachment exists.
pub fn ensure_reach_pdf(app: &AppHandle, original_path: &str) -> Result<ReachPathResult, String> {
    let trimmed = original_path.trim();
    if trimmed.is_empty() {
        return Err("Teaching PDF path is empty".to_string());
    }
    let path = PathBuf::from(trimmed);
    let _ = assert_allowed_pdf(app, &path)?;

    let original = to_original_pdf_path(&path);
    let reach = to_reach_pdf_path(&path);

    if reach.as_path() == original.as_path() {
        return Err("Invalid reach PDF path".to_string());
    }

    if !reach.exists() {
        if !original.exists() {
            return Err("Original teaching PDF not found".to_string());
        }
        // Read via allowlisted API (size checks).
        let bytes = teaching_pdf::read_teaching_pdf_bytes(app, &original.to_string_lossy())?;
        fs::write(&reach, &bytes).map_err(|e| format!("Failed to create reach PDF: {e}"))?;
        allow_teaching_pdf_read_path(app, &reach)?;

        let mut doc = load_doc(&reach)?;
        upsert_embedded_json(&mut doc, EMPTY_ANNOTATION_JSON)?;
        save_doc(&mut doc, &reach)?;
    } else {
        allow_teaching_pdf_read_path(app, &reach)?;
        // Ensure attachment exists.
        let mut doc = load_doc(&reach)?;
        if extract_embedded_json(&mut doc)?.is_none() {
            upsert_embedded_json(&mut doc, EMPTY_ANNOTATION_JSON)?;
            save_doc(&mut doc, &reach)?;
        }
    }

    Ok(ReachPathResult {
        reach_path: reach.to_string_lossy().into_owned(),
        appearance_warning: None,
    })
}

pub fn read_reach_annotations(
    app: &AppHandle,
    path: &str,
) -> Result<ReachAnnotationsResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Teaching PDF path is empty".to_string());
    }
    let path = PathBuf::from(trimmed);
    let _ = assert_allowed_pdf(app, &path)?;
    let reach = to_reach_pdf_path(&path);

    if !reach.exists() {
        return Ok(ReachAnnotationsResult {
            json: EMPTY_ANNOTATION_JSON.to_string(),
        });
    }
    allow_teaching_pdf_read_path(app, &reach)?;
    let mut doc = load_doc(&reach)?;
    let json = extract_embedded_json(&mut doc)?.unwrap_or_else(|| EMPTY_ANNOTATION_JSON.to_string());
    Ok(ReachAnnotationsResult { json })
}

pub fn write_reach_annotations(
    app: &AppHandle,
    path: &str,
    json: &str,
) -> Result<ReachPathResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Teaching PDF path is empty".to_string());
    }
    // Ensure sibling exists (lazy create on first edit).
    let ensured = ensure_reach_pdf(app, trimmed)?;
    let reach = PathBuf::from(&ensured.reach_path);
    if !is_reach_pdf_path(&reach) {
        return Err("Refusing to write original PDF".to_string());
    }
    let mut doc = load_doc(&reach)?;
    upsert_embedded_json(&mut doc, json)?;
    // JSON must persist even if appearances fail (spec §7).
    let appearance_warning = match parse_annotation_doc(json) {
        Ok(ann) => match apply_reach_appearances(&mut doc, &ann) {
            Ok(()) => None,
            Err(e) => Some(format!("Annotations saved, but appearances failed: {e}")),
        },
        Err(e) => Some(format!("Annotations saved, but appearances failed: {e}")),
    };
    save_doc(&mut doc, &reach)?;
    Ok(ReachPathResult {
        reach_path: ensured.reach_path,
        appearance_warning,
    })
}

fn ensure_dest_is_reach_pdf(path: &Path) -> Result<PathBuf, String> {
    if is_reach_pdf_path(path) {
        return Ok(path.to_path_buf());
    }
    let s = path.to_string_lossy();
    if s.to_ascii_lowercase().ends_with(".pdf") {
        let stem = &s[..s.len() - 4];
        return Ok(PathBuf::from(format!("{stem}{REACH_SUFFIX}")));
    }
    Ok(PathBuf::from(format!("{s}{REACH_SUFFIX}")))
}

fn page_source_for_export(source: &Path) -> PathBuf {
    let original = to_original_pdf_path(source);
    let reach = to_reach_pdf_path(source);
    if original.exists() {
        original
    } else if reach.exists() {
        reach
    } else {
        source.to_path_buf()
    }
}

/// Export pages `from_page..=to_page` (1-based inclusive) to a new `.reach.pdf`.
/// Never modifies the original or replaces the full working sibling with a subset.
pub fn export_reach_pdf(
    app: &AppHandle,
    source_path: &str,
    from_page: u32,
    to_page: u32,
    dest_path: &str,
) -> Result<ReachExportResult, String> {
    let source_trimmed = source_path.trim();
    let dest_trimmed = dest_path.trim();
    if source_trimmed.is_empty() || dest_trimmed.is_empty() {
        return Err("Teaching PDF path is empty".to_string());
    }
    if from_page == 0 || to_page == 0 || from_page > to_page {
        return Err("Invalid export page range".to_string());
    }

    let source = PathBuf::from(source_trimmed);
    let _ = assert_allowed_pdf(app, &source)?;

    let dest = ensure_dest_is_reach_pdf(Path::new(dest_trimmed))?;
    if !is_reach_pdf_path(&dest) {
        return Err("Export destination must be a .reach.pdf".to_string());
    }
    // Never overwrite the open full sibling with a subset export.
    let source_reach = to_reach_pdf_path(&source);
    if dest.exists() {
        if let (Ok(dest_can), Ok(reach_can)) = (dest.canonicalize(), source_reach.canonicalize()) {
            if dest_can == reach_can {
                return Err("Refusing to replace the full working sibling with an export".to_string());
            }
        } else if dest == source_reach {
            return Err("Refusing to replace the full working sibling with an export".to_string());
        }
    }
    let source_original = to_original_pdf_path(&source);
    if dest == source_original || (!is_reach_pdf_path(&dest) && dest == source) {
        return Err("Refusing to write original PDF".to_string());
    }

    let page_source = page_source_for_export(&source);
    if !page_source.exists() {
        return Err("Source PDF for export not found".to_string());
    }

    // Annotations come from the reach sibling when present.
    let ann_json = {
        let reach = to_reach_pdf_path(&source);
        if reach.exists() {
            allow_teaching_pdf_read_path(app, &reach)?;
            let mut reach_doc = load_doc(&reach)?;
            extract_embedded_json(&mut reach_doc)?.unwrap_or_else(|| EMPTY_ANNOTATION_JSON.to_string())
        } else {
            EMPTY_ANNOTATION_JSON.to_string()
        }
    };
    let ann_doc = parse_annotation_doc(&ann_json)?;
    let remapped = filter_and_remap_annotations(&ann_doc, from_page, to_page);
    let remapped_json = serialize_annotation_doc(&remapped)?;

    let mut doc = load_doc(&page_source)?;
    let pages = doc.get_pages();
    let page_count = pages.len() as u32;
    if to_page > page_count {
        return Err(format!(
            "Export range {from_page}-{to_page} exceeds page count {page_count}"
        ));
    }
    let to_delete: Vec<u32> = pages
        .keys()
        .copied()
        .filter(|n| *n < from_page || *n > to_page)
        .collect();
    if !to_delete.is_empty() {
        doc.delete_pages(&to_delete);
    }

    upsert_embedded_json(&mut doc, &remapped_json)?;
    let appearance_warning = match apply_reach_appearances(&mut doc, &remapped) {
        Ok(()) => None,
        Err(e) => Some(format!("Export written, but appearances failed: {e}")),
    };

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create export folder: {e}"))?;
    }
    save_doc(&mut doc, &dest)?;
    allow_teaching_pdf_read_path(app, &dest)?;

    Ok(ReachExportResult {
        dest_path: dest.to_string_lossy().into_owned(),
        appearance_warning,
    })
}

pub fn delete_reach_pdf(app: &AppHandle, path: &str) -> Result<ReachDeleteResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Teaching PDF path is empty".to_string());
    }
    let path = PathBuf::from(trimmed);
    let _ = assert_allowed_pdf(app, &path)?;
    let reach = to_reach_pdf_path(&path);
    let original = to_original_pdf_path(&path);

    if reach.as_path() == original.as_path() || !is_reach_pdf_path(&reach) {
        return Err("Refusing to delete original PDF".to_string());
    }

    if !reach.exists() {
        return Ok(ReachDeleteResult { deleted: false });
    }
    fs::remove_file(&reach).map_err(|e| format!("Failed to delete reach PDF: {e}"))?;
    Ok(ReachDeleteResult { deleted: true })
}
