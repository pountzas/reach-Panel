# Free write PDF: export & appearances (Slice 3) — Design Spec

**Date:** 2026-10-15  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Epic:** [2026-10-15-free-write-pdf-epic.md](./2026-10-15-free-write-pdf-epic.md)  
**Depends on:** Slice 2 — [2026-10-15-free-write-pdf-ink-design.md](./2026-10-15-free-write-pdf-ink-design.md)  
**Scope:** Page-range export to a new `.reach.pdf`; appearance streams on sibling save and export. Windows only.

## 1. Goals

- User exports **selected pages** (From / To, All, Current) including ink + text to a **new file** via Save dialog.
- Export remains **editable in ReachPanel** (embedded JSON, same schema as Slice 2).
- **Other viewers** (e.g. Edge) can **see** ink/text via appearance streams.
- Full working sibling `name.reach.pdf` also gets appearances refreshed on annotation save (not only on export).

## 2. Non-goals

- Thumbnail multi-select page picker.
- Overwriting the full sibling with a page subset.
- Editing ReachPanel annotations inside third-party apps (view-only appearances).
- Cloud upload / email share integration.
- Changing Slice 2 tool set.

## 3. Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| Export output | **A** — new file via Save dialog; full sibling unchanged |
| Page pick UI | **C** — From / To + All pages + Current page |
| Appearances | **B** — write on full sibling save **and** on every export |
| Format | Same Approach 2 JSON + page content; Slice 3 adds hybrid appearances |

## 4. Context

- Slice 2: sibling `name.reach.pdf`, attachment `reach-annotations.json`, overlay editor.
- Original `name.pdf` still never modified.
- Example: 50-page PDF, ink on pages 4–12 → export From 4 To 12 → new file with 9 pages.

## 5. Export UX

### 5.1 Entry

Toolbar control **Export** (icon-only preferred, accessible label `freeWritePdfExport`) on the PDF pane when a document is open.

### 5.2 Dialog

Fields / actions:

| Control | Behavior |
| --- | --- |
| From | Integer 1..N (inclusive) |
| To | Integer 1..N (inclusive), ≥ From |
| All pages | Sets From=1, To=N |
| Current page | Sets From=To=current page |
| Export… | Validate → native save dialog → write file |
| Cancel | Close dialog |

Default when opening dialog: From=1, To=N (or Current-only if product prefers — **default All / full range**).

Validation errors: inline or notify (From/To out of range, From > To).

### 5.3 Save dialog

- Default filename suggestion: `{originalBase}-pages-{from}-{to}.reach.pdf` (or `-page-{n}.reach.pdf` when from===to).
- Filter: PDF.

## 6. Export pipeline

1. Flush any pending debounced annotation save for the open document.
2. Validate range against page count.
3. Build new PDF:
   - Copy page contents for indices `from..to` from the **original** (fallback: page streams from sibling if original missing).
   - Filter annotation JSON to those pages; **remap** keys to `1..K` in order.
   - Embed `reach-annotations.json` with `schemaVersion: 1`.
   - Draw **appearance streams** (or equivalent visible page content/annotation appearances) for strokes and text on each exported page.
4. Write to the user-chosen path.
5. Do **not** change which file is active in the Free write library unless the user later opens the export.

### 6.1 Remap example

Source pages 4–12 with annotations on 4 and 12 → export pages object keys `"1"` (was 4) and `"9"` (was 12).

## 7. Appearances on sibling save

Upgrade Slice 2 `write_reach_annotations` path:

1. Update embedded JSON (as today).
2. Regenerate appearances for **all pages that have annotations** (or all pages — implementation may regenerate only dirty pages for speed).

Failure policy: if appearances fail but JSON write succeeded, notify a warning; ReachPanel edit must still work from JSON.

## 8. Opening an export

- User may Open the exported `.reach.pdf` directly.
- Slice 2 resolution: page bytes from that file; annotations from its attachment.
- `toOriginalPdfPath` may point at a non-existent `*-pages-4-12.pdf` — that is fine; do not require a sibling pair for exports.
- Editing the export updates **that file** (ensure/write on the open reach path), not the classroom original’s sibling.

## 9. Frontend / i18n

- Export dialog component (leaf client UI) invoked from `FreeWritePdfPane`.
- Keys: `freeWritePdfExport`, `freeWritePdfExportFrom`, `freeWritePdfExportTo`, `freeWritePdfExportAll`, `freeWritePdfExportCurrent`, `freeWritePdfExportSave`, `freeWritePdfExportCancel`, plus short validation messages.

## 10. Backend

| API | Role |
| --- | --- |
| `cmd_export_teaching_reach_pdf` | `{ sourcePath, fromPage, toPage, destPath }` → write export |
| Appearance helper | Shared by export and sibling write |
| Save dialog | `cmd_pick_teaching_reach_export_path` or reuse a generic save picker |

Page indices are **1-based inclusive** in the command API.

## 11. Testing

**Unit:**

- `normalizePageRange(from, to, pageCount, mode)` → validated inclusive range.
- `filterAndRemapAnnotations(doc, from, to)` → new doc with pages `1..K`.

**Manual:**

- Ink/text on 4–12 → export → reopen in ReachPanel → edit stroke → save.
- Open export in Edge (or similar) → ink/text visible.
- Full sibling after Slice 3 save → visible in Edge without exporting.
- Original `name.pdf` still unchanged; full `name.reach.pdf` still has all pages.

## 12. Acceptance criteria (Slice 3)

- [ ] Export dialog: From / To, All, Current; Save creates new `.reach.pdf`.
- [ ] Exported file contains only selected pages + ink/text for those pages.
- [ ] Reopen export in ReachPanel: annotations editable.
- [ ] External viewer shows appearances on export.
- [ ] Sibling save regenerates appearances (hybrid).
- [ ] Full sibling not replaced by subset export.
- [ ] Tests for range validation and annotation remap.

## 13. Relationship to issue #168

Completes issue acceptance for export + editable round-trip, with the chosen format: **ReachPanel JSON + appearances** (not pure ISO Ink-only).
