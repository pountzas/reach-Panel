# Slice 2 evidence — Free write PDF ink/text

**Branch:** `pountzas/free-write-pdf-slice2`  
**Base:** `pountzas/free-write-pdf-single-document` (Slice 1 merge commit `c4df2b6`)

## Automated

| Check | Result |
| --- | --- |
| `npm test -- …/reachPdfPath.test.ts …/pdfAnnotations.test.ts …/pdfInkGeometry.test.ts …/isFreeWriteCaptureActive.test.ts` | 15 passed |
| `npm run typecheck` | pass |
| `cargo check` (src-tauri) | pass |

## Spec §11 acceptance map

| Criterion | Status |
| --- | --- |
| Pen draws black ink; persists per page across zoom/page when sibling exists | Implemented (overlay + debounced `cmd_write_teaching_reach_annotations`); restart/manual QA pending on device |
| Brush eraser affects pen only; text via trash when selected | Implemented (`eraseStrokesWithBrush` + trash toolbar) |
| Text: place, type, move, re-edit | Implemented (overlay + `pdfText` OSK focus) |
| Undo ~50 | Implemented (`createUndoStack(50)` + gesture snapshots) |
| Original PDF unchanged; sibling on first edit | Rust ensure/write only touches `.reach.pdf` |
| Opening original loads sibling annotations | `loadFreeWriteAnnotations` → `cmd_read_teaching_reach_annotations` |
| Clear all confirms + deletes sibling | Confirm + `cmd_delete_teaching_reach_pdf` |
| No export UI; no appearance streams | Not added |
| Path + annotation/undo unit tests | Present and green |

## Commands added (Rust)

- `cmd_ensure_teaching_reach_pdf`
- `cmd_read_teaching_reach_annotations`
- `cmd_write_teaching_reach_annotations`
- `cmd_delete_teaching_reach_pdf`
