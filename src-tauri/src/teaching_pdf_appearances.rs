//! Visible ink/text content streams for Reach PDF siblings and exports.
//! Overlay streams are tagged `/ReachOverlay true` so regenerates replace,
//! rather than stack, previous drawings.

use lopdf::{dictionary, Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const OVERLAY_FLAG: &[u8] = b"ReachOverlay";
const FONT_NAME: &[u8] = b"FReach";
const DEFAULT_FONT_SIZE: f32 = 12.0;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationDoc {
    pub schema_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_path_hint: Option<String>,
    #[serde(default)]
    pub pages: BTreeMap<String, PageAnnotations>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PageAnnotations {
    #[serde(default)]
    pub strokes: Vec<Stroke>,
    #[serde(default)]
    pub texts: Vec<TextBox>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Stroke {
    pub id: String,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default = "default_width")]
    pub width: f64,
    pub points: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TextBox {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    #[serde(default)]
    pub body: String,
}

fn default_color() -> String {
    "#000000".to_string()
}

fn default_width() -> f64 {
    0.002
}

pub fn parse_annotation_doc(json: &str) -> Result<AnnotationDoc, String> {
    serde_json::from_str(json).map_err(|e| format!("Invalid annotation JSON: {e}"))
}

pub fn serialize_annotation_doc(doc: &AnnotationDoc) -> Result<String, String> {
    serde_json::to_string(doc).map_err(|e| format!("Failed to serialize annotations: {e}"))
}

/// Keep pages `from..=to` (1-based inclusive) and remap keys to `1..K`.
pub fn filter_and_remap_annotations(doc: &AnnotationDoc, from: u32, to: u32) -> AnnotationDoc {
    let mut pages = BTreeMap::new();
    for page in from..=to {
        let key = page.to_string();
        if let Some(ann) = doc.pages.get(&key) {
            let dest = (page - from + 1).to_string();
            pages.insert(dest, ann.clone());
        }
    }
    AnnotationDoc {
        schema_version: doc.schema_version,
        original_path_hint: doc.original_path_hint.clone(),
        pages,
    }
}

fn parse_hex_color(color: &str) -> (f32, f32, f32) {
    let s = color.trim().trim_start_matches('#');
    if s.len() >= 6 {
        let r = u8::from_str_radix(&s[0..2], 16).unwrap_or(0) as f32 / 255.0;
        let g = u8::from_str_radix(&s[2..4], 16).unwrap_or(0) as f32 / 255.0;
        let b = u8::from_str_radix(&s[4..6], 16).unwrap_or(0) as f32 / 255.0;
        return (r, g, b);
    }
    (0.0, 0.0, 0.0)
}

fn escape_pdf_literal(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '(' | ')' | '\\' => {
                out.push('\\');
                out.push(ch);
            }
            '\r' => out.push_str("\\r"),
            '\n' => out.push_str("\\n"),
            c if (c as u32) < 0x20 || (c as u32) > 0x7e => {
                // WinAnsi-ish fallback: drop non-latin1 for Type1 Helvetica.
                if (c as u32) <= 0xff {
                    out.push(c);
                } else {
                    out.push('?');
                }
            }
            c => out.push(c),
        }
    }
    out
}

fn page_media_size(doc: &Document, page_id: ObjectId) -> Result<(f32, f32), String> {
    let mut current = page_id;
    for _ in 0..32 {
        let dict = doc
            .get_dictionary(current)
            .map_err(|e| format!("Page dictionary: {e}"))?;
        if let Ok(Object::Array(arr)) = dict.get(b"MediaBox") {
            if arr.len() >= 4 {
                let x0 = object_as_f32(&arr[0]).unwrap_or(0.0);
                let y0 = object_as_f32(&arr[1]).unwrap_or(0.0);
                let x1 = object_as_f32(&arr[2]).unwrap_or(612.0);
                let y1 = object_as_f32(&arr[3]).unwrap_or(792.0);
                return Ok(((x1 - x0).abs(), (y1 - y0).abs()));
            }
        }
        match dict.get(b"Parent").and_then(Object::as_reference) {
            Ok(parent) => current = parent,
            Err(_) => break,
        }
    }
    Ok((612.0, 792.0))
}

fn object_as_f32(obj: &Object) -> Option<f32> {
    match obj {
        Object::Integer(i) => Some(*i as f32),
        Object::Real(r) => Some(*r),
        Object::Reference(_) => None,
        _ => None,
    }
}

fn is_reach_overlay_stream(doc: &Document, id: ObjectId) -> bool {
    let Ok(Object::Stream(stream)) = doc.get_object(id) else {
        return false;
    };
    matches!(stream.dict.get(OVERLAY_FLAG), Ok(Object::Boolean(true)))
}

fn strip_reach_overlays(doc: &mut Document, page_id: ObjectId) -> Result<(), String> {
    let content_ids = doc.get_page_contents(page_id);
    let keep: Vec<Object> = content_ids
        .iter()
        .copied()
        .filter(|id| !is_reach_overlay_stream(doc, *id))
        .map(Object::Reference)
        .collect();
    let remove: Vec<ObjectId> = content_ids
        .into_iter()
        .filter(|id| is_reach_overlay_stream(doc, *id))
        .collect();

    let page = doc
        .get_object_mut(page_id)
        .map_err(|e| e.to_string())?
        .as_dict_mut()
        .map_err(|e| e.to_string())?;
    match keep.len() {
        0 => {
            page.remove(b"Contents");
        }
        1 => page.set("Contents", keep[0].clone()),
        _ => page.set("Contents", keep),
    }
    for id in remove {
        doc.objects.remove(&id);
    }
    Ok(())
}

fn ensure_page_font(doc: &mut Document, page_id: ObjectId) -> Result<(), String> {
    let font_dict = dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    };
    let font_id = doc.add_object(font_dict);

    let resources_snapshot = {
        let page = doc
            .get_object(page_id)
            .map_err(|e| e.to_string())?
            .as_dict()
            .map_err(|e| e.to_string())?;
        match page.get(b"Resources") {
            Ok(Object::Dictionary(d)) => Some(Object::Dictionary(d.clone())),
            Ok(Object::Reference(id)) => Some(Object::Reference(*id)),
            _ => None,
        }
    };

    let resources_id = match resources_snapshot {
        Some(Object::Reference(id)) => id,
        Some(Object::Dictionary(d)) => doc.add_object(d),
        _ => doc.add_object(dictionary! {}),
    };

    {
        let page = doc
            .get_object_mut(page_id)
            .map_err(|e| e.to_string())?
            .as_dict_mut()
            .map_err(|e| e.to_string())?;
        page.set("Resources", Object::Reference(resources_id));
    }

    let font_target = {
        let resources = doc
            .get_object(resources_id)
            .map_err(|e| e.to_string())?
            .as_dict()
            .map_err(|e| e.to_string())?;
        match resources.get(b"Font") {
            Ok(Object::Reference(id)) => FontTarget::ExistingMap(*id),
            Ok(Object::Dictionary(d)) => FontTarget::InlineMap(d.clone()),
            _ => FontTarget::Missing,
        }
    };

    match font_target {
        FontTarget::ExistingMap(font_map_id) => {
            let fonts = doc
                .get_object_mut(font_map_id)
                .map_err(|e| e.to_string())?
                .as_dict_mut()
                .map_err(|e| e.to_string())?;
            fonts.set(FONT_NAME, Object::Reference(font_id));
        }
        FontTarget::InlineMap(mut fonts) => {
            fonts.set(FONT_NAME, Object::Reference(font_id));
            let resources = doc
                .get_object_mut(resources_id)
                .map_err(|e| e.to_string())?
                .as_dict_mut()
                .map_err(|e| e.to_string())?;
            resources.set("Font", fonts);
        }
        FontTarget::Missing => {
            let resources = doc
                .get_object_mut(resources_id)
                .map_err(|e| e.to_string())?
                .as_dict_mut()
                .map_err(|e| e.to_string())?;
            resources.set(
                "Font",
                dictionary! {
                    FONT_NAME => Object::Reference(font_id),
                },
            );
        }
    }
    Ok(())
}

enum FontTarget {
    ExistingMap(ObjectId),
    InlineMap(lopdf::Dictionary),
    Missing,
}
fn build_overlay_content(page: &PageAnnotations, width: f32, height: f32) -> Vec<u8> {
    let mut ops = String::new();
    ops.push_str("q\n");

    let min_dim = width.min(height);

    for stroke in &page.strokes {
        if stroke.points.len() < 2 {
            continue;
        }
        let (r, g, b) = parse_hex_color(&stroke.color);
        let line_w = ((stroke.width as f32) * min_dim).max(0.5);
        ops.push_str("q\n");
        ops.push_str(&format!("{line_w:.4} w\n"));
        ops.push_str("1 J\n1 j\n"); // round cap/join
        ops.push_str(&format!("{r:.4} {g:.4} {b:.4} RG\n"));
        for (i, pt) in stroke.points.iter().enumerate() {
            let x = (pt[0] as f32) * width;
            let y = (1.0 - (pt[1] as f32)) * height;
            if i == 0 {
                ops.push_str(&format!("{x:.3} {y:.3} m\n"));
            } else {
                ops.push_str(&format!("{x:.3} {y:.3} l\n"));
            }
        }
        ops.push_str("S\nQ\n");
    }

    for text in &page.texts {
        if text.body.is_empty() {
            continue;
        }
        let x = (text.x as f32) * width;
        // CSS top → PDF baseline slightly below the top edge of the box.
        let y = (1.0 - (text.y as f32)) * height - DEFAULT_FONT_SIZE;
        let escaped = escape_pdf_literal(&text.body);
        ops.push_str("BT\n");
        ops.push_str(&format!("/{name} {DEFAULT_FONT_SIZE} Tf\n", name = "FReach"));
        ops.push_str("0 0 0 rg\n");
        ops.push_str(&format!("{x:.3} {y:.3} Td\n"));
        ops.push_str(&format!("({escaped}) Tj\n"));
        ops.push_str("ET\n");
    }

    ops.push_str("Q\n");
    ops.into_bytes()
}

fn apply_page_appearances(
    doc: &mut Document,
    page_id: ObjectId,
    page: &PageAnnotations,
) -> Result<(), String> {
    strip_reach_overlays(doc, page_id)?;
    if page.strokes.is_empty() && page.texts.is_empty() {
        return Ok(());
    }
    let (width, height) = page_media_size(doc, page_id)?;
    ensure_page_font(doc, page_id)?;
    let content = build_overlay_content(page, width, height);
    let stream = Stream::new(
        dictionary! {
            OVERLAY_FLAG => true,
        },
        content,
    );
    let stream_id = doc.add_object(stream);

    let page_dict = doc
        .get_object_mut(page_id)
        .map_err(|e| e.to_string())?
        .as_dict_mut()
        .map_err(|e| e.to_string())?;
    let mut list: Vec<Object> = match page_dict.get(b"Contents") {
        Ok(Object::Reference(id)) => vec![Object::Reference(*id)],
        Ok(Object::Array(arr)) => arr.clone(),
        _ => Vec::new(),
    };
    list.push(Object::Reference(stream_id));
    page_dict.set("Contents", list);
    Ok(())
}

/// Draw (or clear) Reach overlays from annotation JSON onto every page.
pub fn apply_reach_appearances(doc: &mut Document, annotations: &AnnotationDoc) -> Result<(), String> {
    let pages = doc.get_pages();
    for (page_num, page_id) in pages {
        let key = page_num.to_string();
        let empty = PageAnnotations::default();
        let page_ann = annotations.pages.get(&key).unwrap_or(&empty);
        apply_page_appearances(doc, page_id, page_ann)?;
    }
    // Also strip overlays on pages that had ink removed entirely — already handled
    // by iterating all pages with empty default.
    Ok(())
}
