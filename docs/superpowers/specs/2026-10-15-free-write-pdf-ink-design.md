# Free write PDF: ink & text (Slice 2) — Design Spec

**Date:** 2026-10-15  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Epic:** [2026-10-15-free-write-pdf-epic.md](./2026-10-15-free-write-pdf-epic.md)  
**Depends on:** Slice 1 — [2026-10-15-free-write-pdf-single-document-design.md](./2026-10-15-free-write-pdf-single-document-design.md)  
**Scope:** Pen, brush eraser, text boxes, undo, Clear all; sibling `name.reach.pdf` with embedded JSON. Windows only.

## 1. Goals

- Draw on PDF pages with a **black pen**; **brush-erase** pen geometry (partial erase).
- **Text:** tap to place, type (on-screen keyboard), drag to move; delete via **trash** when selected (not via eraser brush).
- **Undo** multi-step (~50) for the current document.
- Persist work in sibling **`name.reach.pdf`** without modifying **`name.pdf`**.
- Opening the **original** restores ink/text when the sibling exists.
- **Clear all** (confirm) deletes the sibling and clears in-memory annotations + undo.

## 2. Non-goals (Slice 3 / later)

- Page-range **export** / Save-as subset.
- **Appearance streams** so Edge/Acrobat show ink (Slice 3 writes these on sibling save and export).
- Pen color/width picker; highlighter; shapes.
- Close confirmation beyond flushing a pending debounced save (optional soft confirm only if write fails).

## 3. Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| Tools | Black pen + brush eraser + text + undo + Clear all + text trash |
| Text UX | Tap place → type → drag move; re-tap to edit |
| Eraser | Brush on pen strokes only; text deleted via trash |
| Undo | Document-wide stack (~50 actions) |
| Persistence | Sibling `name.reach.pdf`; Approach 2 — page copy + embedded JSON |
| Sibling create | On **first edit** (lazy) |
| Clear all | Confirm → delete sibling |

## 4. Context

- Viewer: `src/components/teaching/FreeWritePdfPane.tsx` (pdf.js canvas) after Slice 1 single-doc toolbar.
- Backend today: `src-tauri/src/teaching_pdf.rs` (pick/read/list/save library).
- Slice 1 store: at most one `TeachingPdfEntry`; `closeTeachingPdf` clears path.

## 5. Document identity & files

### 5.1 Naming

| Role | Path |
| --- | --- |
| Original | `…/name.pdf` (never written by ReachPanel) |
| Working sibling | `…/name.reach.pdf` |

Helpers (pure, unit-tested):

- `toReachPdfPath(originalOrReach: string): string`
- `toOriginalPdfPath(originalOrReach: string): string`
- `isReachPdfPath(path: string): boolean`

Rules: case-insensitive `.pdf` / `.reach.pdf` on Windows; reject odd double suffixes in tests; basename `foo.reach.pdf` ↔ original `foo.pdf`.

### 5.2 Open resolution

When the user opens path `P`:

1. Compute `original = toOriginalPdfPath(P)`, `reach = toReachPdfPath(P)`.
2. **Page bytes** for pdf.js: prefer **original** if it exists; else load `P` (e.g. user opened only a `.reach.pdf` / export).
3. **Annotations:** if `reach` exists, read embedded JSON; else empty document annotations.
4. Store/library still records the path the user picked (Slice 1); resolution runs on each load.

### 5.3 First edit

On first pen stroke, erase dab, or text place:

1. If sibling missing: copy original page bytes → create `name.reach.pdf`, attach empty/current JSON.
2. Subsequent edits: update embedded JSON only (debounce 300–500ms).

### 5.4 Clear all

1. Confirm dialog (i18n).
2. Delete `name.reach.pdf` if present.
3. Clear in-memory annotations, selection, undo stack.
4. Page viewer keeps showing the original PDF.

## 6. Tools, overlay, model

### 6.1 Toolbar cluster

After Slice 1 controls (Open, Close, nav, zoom, filename), add:

`Pen` | `Eraser` | `Text` | `Undo` | `Clear all` | `Trash`\*

\*Trash visible only when a text box is selected.

Icon-only `TeachingLessonToolbarButton` where possible; accessible labels via i18n.

### 6.2 Behavior

| Tool | Behavior |
| --- | --- |
| Pen | Black stroke; fixed base width; points stored in **normalized page coordinates** (0–1 relative to page width/height) |
| Eraser | Circular brush; removes or splits pen geometry under the brush; ignores text |
| Text | Tap empty → create box; focus for typing; drag move; tap select/edit |
| Trash | Deletes selected text box |
| Undo | Pop last action (stroke complete, erase stroke, text create/move/edit/delete) |
| Clear all | Confirm → §5.4 |

Default tool when a document is open: **Pen**.

### 6.3 Overlay

- Layer above the pdf.js canvas, same CSS size as the rendered page.
- Transform with zoom/scroll via shared viewport; store coords in page-normalized space so zoom does not destroy data.
- Pointer capture while drawing/erasing/dragging text.

### 6.4 JSON schema (embedded attachment)

Attachment name: `reach-annotations.json` (exact name fixed in implementation).

```json
{
  "schemaVersion": 1,
  "originalPathHint": "optional string",
  "pages": {
    "1": {
      "strokes": [
        {
          "id": "uuid",
          "color": "#000000",
          "width": 0.002,
          "points": [[0.1, 0.2], [0.12, 0.22]]
        }
      ],
      "texts": [
        {
          "id": "uuid",
          "x": 0.2,
          "y": 0.3,
          "w": 0.4,
          "body": "hello"
        }
      ]
    }
  }
}
```

- Page keys: 1-based page numbers as strings.
- `width` / positions: normalized to page dimensions.
- Unknown `schemaVersion`: fail load with user-visible error; do not wipe sibling.

### 6.5 Undo

- Stack of inverse commands or snapshots-of-change (implementation choice); cap **50**.
- Clear all after confirm is **not** pushable as a single undo of the deleted file (file is gone); stack cleared.
- Switching documents clears the undo stack for the previous doc.

## 7. Backend (Rust)

Extend teaching PDF module (same crate area as `teaching_pdf.rs` or a sibling module):

| Command / API | Role |
| --- | --- |
| Resolve paths | original ↔ reach; allowlist same as teaching PDF reads |
| `ensure_reach_pdf` | Copy original → sibling if missing; ensure attachment slot |
| `read_reach_annotations` | Return JSON string or structured value |
| `write_reach_annotations` | Replace attachment; create sibling if needed |
| `delete_reach_pdf` | Delete sibling only (never original) |

Security: reuse path allowlist; only operate on user-picked / library paths; never write the original path.

## 8. Frontend architecture

- Pure helpers: `src/lib/teaching/reachPdfPath.ts` (or under `pdfAnnotations/`).
- Annotation types + undo: `src/lib/teaching/pdfAnnotations.ts` (+ tests).
- Overlay UI: component used by `FreeWritePdfPane` (keep pane from becoming a god file — extract overlay/tools).
- Store: load/save annotations for active document; tool mode; selected text id; dirty + debounced invoke write.
- Keyboard: when a text box is focused, Free write focus routes typing into that box (extend existing free-write focus model as needed).

## 9. Error handling

- Missing original but sibling present: still open sibling pages + JSON; show filename from open path.
- Write failure: `notify.error`; keep memory dirty and retry on next edit / flush on Close.
- Delete sibling failure: notify; do not claim cleared.

## 10. Testing

**Unit:** path helpers; JSON parse/validate; undo push/pop/cap; eraser geometry helpers if pure.

**Manual:**

- Draw on page 2 → restart → open original → marks present.
- Brush-erase part of a stroke; text survives eraser; trash deletes text.
- Undo restores last actions.
- Clear all → sibling gone → marks gone; original file still on disk.
- Zoom/page change does not drop strokes.

## 11. Acceptance criteria (Slice 2)

- [ ] Pen draws black ink; persists per page across zoom/page/restart when sibling exists.
- [ ] Brush eraser affects pen only; text deleted only via trash when selected.
- [ ] Text: place, type, move, re-edit.
- [ ] Undo works for recent document actions (~50).
- [ ] Original PDF bytes unchanged; sibling `name.reach.pdf` created on first edit.
- [ ] Opening original loads sibling annotations.
- [ ] Clear all confirms and deletes sibling; UI cleared.
- [ ] No export UI; no appearance streams required yet.
- [ ] Tests for path helpers and annotation/undo pure logic.

## 12. Handoff to Slice 3

- Export subset pages + remap JSON page indices.
- Regenerate **appearances** on sibling save and on export so other viewers see ink/text.
- Export dialog: From / To, All pages, Current page.
