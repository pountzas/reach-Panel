# Free write PDF: single document (Slice 1) — Design Spec

**Date:** 2026-10-15  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Epic:** [2026-10-15-free-write-pdf-epic.md](./2026-10-15-free-write-pdf-epic.md)  
**Scope:** Teaching → Language → Free write PDF pane: one active PDF, toolbar chrome, library migration. Windows app only.  
**Supersedes (PDF chrome only):** multi-entry “recent library” / Remove UX in `docs/superpowers/specs/2026-08-20-teaching-free-write-design.md` §7.3.

## 1. Goals (Slice 1)

- At most **one** loaded PDF per profile; opening a new file **replaces** the current one.
- Toolbar: icon-only **Open**, optional icon-only **Close**, page nav, zoom, then **filename** (truncated; full path in `title`).
- No “Recent PDFs” list and no **Remove** control anywhere.
- Existing multi-entry `pdf-library.json` files **degrade gracefully** to the most recently opened entry.
- Tests cover single-document helpers and migration behavior.

## 2. Non-goals (later slices of #168)

| Slice | Deferred work |
| --- | --- |
| **2 — Ink** | Draw layer on the page; per-page stroke persistence; pen/eraser or undo; survive zoom/page changes |
| **3 — Export** | Select one or more pages (e.g. range 4–12); export page content + ink; reopen with ink still editable (format chosen in Slice 3 design) |

Also out of Slice 1:

- Close confirmation when unsaved ink exists (Slice 1 closes immediately; Slice 2+ may add confirm).
- Renaming Rust modules / `pdf-library.json` away from “library” wording (optional cleanup when ink storage lands).
- Full Acrobat-style annotation suite.

## 3. Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| Delivery | **B** — Slice 1 (UX + migration) first; then ink; then export (separate PRs, same issue) |
| Missing / unwanted file | Open replaces; plus icon-only **Close document** that clears the active path |
| Close confirm | **C** — Slice 1 clears immediately; confirm only later if unsaved ink |
| Persistence | **Approach 1** — keep `pdf-library.json` as a JSON array of `TeachingPdfEntry`, enforce length ≤ 1 |

## 4. Context

- Viewer: `src/components/teaching/FreeWritePdfPane.tsx` (pdf.js canvas).
- Store: `teachingPdfLibrary`, `freeWriteActivePdfId`, `settings.freeWriteLastPdfId`; actions in `teachingSlice` (`loadTeachingPdfLibrary`, `pickTeachingPdf`, `openTeachingPdf`, `removeTeachingPdf`).
- Helpers: `src/lib/teaching/pdfLibrary.ts` (`TEACHING_PDF_LIBRARY_CAP = 20`, upsert/remove).
- Backend: `src-tauri/src/teaching_pdf.rs` — `cmd_list_teaching_pdfs` / `cmd_save_teaching_pdfs` / `cmd_pick_teaching_pdf` / `cmd_read_teaching_pdf`. Read allowlist trusts picker paths and paths present in the library file after restart.
- Prior design non-goal: “Full PDF annotation” — issue #168 supersedes that for ink + export in later slices.

## 5. Data & store

### 5.1 Invariant

After any successful load or save of the teaching PDF library, the persisted array has **0 or 1** entries.

### 5.2 Migration on load

In `loadTeachingPdfLibrary` (or a pure helper it calls):

1. Parse/filter entries as today (require `id` + `path` strings).
2. If more than one entry: sort by `lastOpenedAt` descending, then `id` ascending for ties; keep the first; **rewrite** the file via `cmd_save_teaching_pdfs` with that single entry.
3. If the library is empty: `freeWriteActivePdfId = null`. Otherwise set it to `settings.freeWriteLastPdfId` when that id equals the kept entry’s id; else the kept entry’s id (so a migrated survivor still becomes active).

### 5.3 Open (replace)

`pickTeachingPdf`:

1. Pick path via `cmd_pick_teaching_pdf` (unchanged).
2. Build one `TeachingPdfEntry` (reuse `id` if the same path was the previous single entry; else new UUID).
3. Save **`[entry]`** (not upsert-into-a-list).
4. Set `freeWriteActivePdfId` and `freeWriteLastPdfId` to that entry.

### 5.4 Close

New `closeTeachingPdf`:

1. Save **`[]`**.
2. Clear `freeWriteActivePdfId` and `freeWriteLastPdfId`.
3. No confirmation in Slice 1.

### 5.5 API cleanup

- Remove `removeTeachingPdf` and `openTeachingPdf` from the store surface if nothing else calls them (today: only `FreeWritePdfPane`).
- Replace multi-entry helpers in `pdfLibrary.ts` with single-document helpers (e.g. migrate-to-single, replace-with-one, clear). Remove `TEACHING_PDF_LIBRARY_CAP` and `removeTeachingPdfEntry` from the product path.
- Rust list/save/read/pick commands **unchanged** for Slice 1; allowlist continues to work with a 0–1 entry file.

## 6. Toolbar & UI

Suggested order on one row:

```text
[Open] [Close*] | prev | page / count | next | zoom − | zoom + | filename……
```

\*Close **hidden** when no document is active.

| Control | Behavior |
| --- | --- |
| **Open** | `TeachingLessonToolbarButton`, icon-only (folder/open style), accessible name from `freeWriteOpenPdf` |
| **Close** | Icon-only (× style), accessible name `freeWriteClosePdf`; calls `closeTeachingPdf` |
| **Filename** | Truncated basename right of zoom; `title` = full path |
| **Recent list** | Removed |
| **Remove** | Removed from list and from missing-file error UI |

Empty state: existing empty copy. Missing file: error text only; user Open to replace or Close to clear.

### i18n

- Stop using `freeWriteRecentPdfs` and `freeWriteRemovePdf`; remove keys once unused.
- Add `freeWriteClosePdf` (all locale files that mirror `en.ts`).

## 7. Error handling

- Picker cancel: no-op (today).
- Load/read failures: keep showing missing/error copy; do not auto-clear the saved path (user may fix the file or Close/Open).
- Save failures on migrate/open/close: `notify.error` as today; leave UI consistent with last successful set state where possible.

## 8. Testing

**Unit (`pdfLibrary` helpers)**

- Multi-entry → single most-recent.
- Replace → length ≤ 1.
- Clear → empty.
- Remove cap/remove-entry tests that encode the old library model.

**Store / integration (follow existing teaching-slice test patterns if present)**

- Load with three entries → one kept; save called with one entry when migration runs.
- Close → `[]` saved; active id and `freeWriteLastPdfId` cleared.

**Manual QA**

- Open → filename on toolbar; no recent list / Remove.
- Open second file → first replaced.
- Close → empty; Open again works.
- Restart with one saved path → restores.
- Restart with old multi-entry library → after first load, only most recent remains on disk.

## 9. Epic handoff (Slices 2–3)

See the epic index: [2026-10-15-free-write-pdf-epic.md](./2026-10-15-free-write-pdf-epic.md).

| Next slice | Spec | Plan |
| --- | --- | --- |
| **2 — Ink & text** | [2026-10-15-free-write-pdf-ink-design.md](./2026-10-15-free-write-pdf-ink-design.md) | [../plans/2026-10-15-free-write-pdf-ink.md](../plans/2026-10-15-free-write-pdf-ink.md) |
| **3 — Export & appearances** | [2026-10-15-free-write-pdf-export-design.md](./2026-10-15-free-write-pdf-export-design.md) | [../plans/2026-10-15-free-write-pdf-export.md](../plans/2026-10-15-free-write-pdf-export.md) |

Slice 1 leaves room for:

- Sibling `name.reach.pdf` + embedded JSON (ink/text), original untouched.
- Export of selected pages with editable JSON + visible appearances.
- Flush pending annotation saves on Close; Clear all lives in Slice 2.

## 10. Acceptance criteria (Slice 1 only)

- [ ] Only one PDF active; Open replaces previous; no recent-PDF list UI.
- [ ] Open PDF is an icon-only toolbar button with accessible label (no visible “Open PDF…” text).
- [ ] Filename appears on toolbar to the right of zoom controls.
- [ ] Icon-only Close clears the document; no Remove PDF button anywhere.
- [ ] Migration: existing multi-entry libraries keep most recent only.
- [ ] Tests for single-PDF helper/store logic.
- [ ] Ink and export explicitly deferred (not in this PR).
