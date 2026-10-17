# Slice 3 evidence — Free write PDF export & appearances

Branch: `pountzas/free-write-pdf-slice3`  
Base: `pountzas/free-write-pdf-single-document` (post Slice 2 merge #264)

## Automated

| Check | Result |
| --- | --- |
| `npm test -- src/lib/teaching/pdfExportRange.test.ts` | 8 passed |
| `npm run typecheck` | pass |
| `cargo check` (src-tauri) | pass |

## Spec §12 acceptance map

| Criterion | Status | Notes |
| --- | --- | --- |
| Export dialog: From / To, All, Current; Save creates new `.reach.pdf` | Implemented | `FreeWritePdfExportDialog` + `cmd_pick_teaching_reach_export_path` / `cmd_export_teaching_reach_pdf` |
| Exported file contains only selected pages + ink/text for those pages | Implemented | Rust `delete_pages` + `filter_and_remap_annotations` |
| Reopen export in ReachPanel: annotations editable | Implemented | Same Slice 2 open/JSON path; export is a `.reach.pdf` |
| External viewer shows appearances on export | Implemented | Tagged overlay content streams on export |
| Sibling save regenerates appearances (hybrid) | Implemented | `write_reach_annotations` calls `apply_reach_appearances`; warning if appearances fail after JSON ok |
| Full sibling not replaced by subset export | Implemented | Guard refuses dest == source sibling |
| Tests for range validation and annotation remap | Pass | `pdfExportRange.test.ts` |

## Manual QA (device)

Requires a multi-page classroom PDF on Windows with ink on pages 4–12:

- [ ] Export 4–12 → page count 9 in ReachPanel
- [ ] Edit ink on export → persists on that file
- [ ] Edge shows appearances on export and on full sibling after save
- [ ] Full `name.reach.pdf` still has all pages; original untouched
