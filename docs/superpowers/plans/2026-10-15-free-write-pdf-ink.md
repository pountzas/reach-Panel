# Free write PDF ink & text (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pen, brush eraser, text, undo, and Clear all on the Free write PDF, persisted in sibling `name.reach.pdf` with embedded JSON — original PDF untouched.

**Architecture:** Pure path + annotation helpers in TS; overlay component above pdf.js; Rust ensure/read/write/delete for the sibling and `reach-annotations.json` attachment; debounced saves after first edit creates the sibling.

**Tech Stack:** React 19, Zustand, Vitest, Tauri 2 (Windows), pdf.js viewer, Rust PDF crate chosen at implement time (must support copy + embedded file attach/replace).

**Spec:** `docs/superpowers/specs/2026-10-15-free-write-pdf-ink-design.md`  
**Epic:** `docs/superpowers/specs/2026-10-15-free-write-pdf-epic.md`  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Depends on:** Slice 1 single-document UX merged or present on the branch.

## Global Constraints

- Windows only; no macOS/Linux stubs.
- Never write or delete the original `name.pdf`.
- No export UI; no appearance streams (Slice 3).
- Do not commit unless the user asks.
- Keep `FreeWritePdfPane.tsx` thin — extract overlay/tools modules.

## File map

| File | Role |
| --- | --- |
| `src/lib/teaching/reachPdfPath.ts` | original ↔ `.reach.pdf` helpers |
| `src/lib/teaching/reachPdfPath.test.ts` | Path tests |
| `src/lib/teaching/pdfAnnotations.ts` | Types, parse/serialize, undo stack helpers |
| `src/lib/teaching/pdfAnnotations.test.ts` | Schema + undo tests |
| `src/lib/teaching/pdfInkGeometry.ts` | Eraser brush vs stroke pure helpers (optional split) |
| `src-tauri/src/teaching_pdf_reach.rs` (or extend `teaching_pdf.rs`) | ensure/read/write/delete |
| `src-tauri/src/lib.rs` | Register commands |
| `src/components/teaching/FreeWritePdfAnnotationOverlay.tsx` | Draw/erase/text UI |
| `src/components/teaching/FreeWritePdfPane.tsx` | Wire tools + overlay + load/save |
| `src/stores/slices/teachingSlice.ts` (+ types) | Annotation state / tool / save actions |
| `src/i18n/*.ts` | Tool + Clear all strings |

---

### Task 1: Path helpers (TDD)

**Files:**
- Create: `src/lib/teaching/reachPdfPath.ts`
- Create: `src/lib/teaching/reachPdfPath.test.ts`
- Modify: `src/lib/teaching/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `REACH_PDF_SUFFIX = ".reach.pdf"`
  - `isReachPdfPath(path: string): boolean`
  - `toReachPdfPath(path: string): string`
  - `toOriginalPdfPath(path: string): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  isReachPdfPath,
  toOriginalPdfPath,
  toReachPdfPath,
} from "./reachPdfPath";

describe("reachPdfPath", () => {
  it("detects .reach.pdf case-insensitively", () => {
    expect(isReachPdfPath("C:\\\\a\\\\doc.reach.pdf")).toBe(true);
    expect(isReachPdfPath("C:\\\\a\\\\doc.REACH.PDF")).toBe(true);
    expect(isReachPdfPath("C:\\\\a\\\\doc.pdf")).toBe(false);
  });

  it("maps original to sibling", () => {
    expect(toReachPdfPath("C:\\\\Books\\\\ws.pdf")).toBe(
      "C:\\\\Books\\\\ws.reach.pdf",
    );
    expect(toReachPdfPath("C:\\\\Books\\\\ws.reach.pdf")).toBe(
      "C:\\\\Books\\\\ws.reach.pdf",
    );
  });

  it("maps sibling back to original", () => {
    expect(toOriginalPdfPath("C:\\\\Books\\\\ws.reach.pdf")).toBe(
      "C:\\\\Books\\\\ws.pdf",
    );
    expect(toOriginalPdfPath("C:\\\\Books\\\\ws.pdf")).toBe(
      "C:\\\\Books\\\\ws.pdf",
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/teaching/reachPdfPath.test.ts`

- [ ] **Step 3: Implement helpers**

Normalize with a case-insensitive check that the path ends with `.reach.pdf` before appending; strip `.reach.pdf` → `.pdf` for original.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit only if user asked**

---

### Task 2: Annotation types + undo (TDD)

**Files:**
- Create: `src/lib/teaching/pdfAnnotations.ts`
- Create: `src/lib/teaching/pdfAnnotations.test.ts`

**Interfaces:**
- Produces:
  - `PdfAnnotationDoc` with `schemaVersion: 1` and `pages: Record<string, PdfPageAnnotations>`
  - `emptyPdfAnnotationDoc(): PdfAnnotationDoc`
  - `parsePdfAnnotationJson(text: string): PdfAnnotationDoc` (throws / Result on bad version)
  - `serializePdfAnnotationJson(doc: PdfAnnotationDoc): string`
  - `UndoStack` with `push`, `undo`, cap 50

- [ ] **Step 1: Tests for empty doc, round-trip JSON, reject schemaVersion 99, undo cap**

```ts
it("round-trips a stroke on page 1", () => {
  const doc = emptyPdfAnnotationDoc();
  doc.pages["1"] = {
    strokes: [
      {
        id: "s1",
        color: "#000000",
        width: 0.002,
        points: [[0.1, 0.2], [0.3, 0.4]],
      },
    ],
    texts: [],
  };
  const again = parsePdfAnnotationJson(serializePdfAnnotationJson(doc));
  expect(again.pages["1"].strokes[0].id).toBe("s1");
});

it("rejects unsupported schemaVersion", () => {
  expect(() =>
    parsePdfAnnotationJson(JSON.stringify({ schemaVersion: 99, pages: {} })),
  ).toThrow();
});
```

- [ ] **Step 2: Implement types + parse/serialize + `createUndoStack(max = 50)`**

Undo entries store `{ undo: () => void }` or before/after page patches — pick one style and use it consistently in the overlay later.

- [ ] **Step 3: Green tests**

Run: `npm test -- src/lib/teaching/pdfAnnotations.test.ts`

---

### Task 3: Eraser geometry helper (TDD)

**Files:**
- Create: `src/lib/teaching/pdfInkGeometry.ts`
- Create: `src/lib/teaching/pdfInkGeometry.test.ts`

**Interfaces:**
- Produces: `eraseStrokesWithBrush(strokes, center: [n,n], radius: number): Stroke[]`  
  Removes points within radius; drops strokes with fewer than 2 points; does not touch texts.

- [ ] **Step 1: Failing test** — stroke with mid-point under brush loses that point or splits per chosen algorithm (document choice in code comment: **drop points within radius, keep polylines ≥ 2 points**).

- [ ] **Step 2: Implement minimal version**

- [ ] **Step 3: Green**

---

### Task 4: Rust sibling PDF + annotation attachment

**Files:**
- Create or extend: `src-tauri/src/teaching_pdf_reach.rs`
- Modify: `src-tauri/src/lib.rs` (mod + invoke handlers)
- Modify: `src-tauri/Cargo.toml` if a PDF crate is required

**Interfaces:**
- `cmd_ensure_teaching_reach_pdf({ originalPath }) -> { reachPath }`
- `cmd_read_teaching_reach_annotations({ path }) -> { json: string }`  
  (`path` may be original or reach; resolve internally)
- `cmd_write_teaching_reach_annotations({ path, json }) -> { reachPath }`
- `cmd_delete_teaching_reach_pdf({ path }) -> { deleted: boolean }`

- [ ] **Step 1: Add crate dependency** supporting read/write PDF + embedded file (evaluate `lopdf` or current ecosystem; pin a version that builds on the project’s Rust edition).

- [ ] **Step 2: Implement path resolve + allowlist checks** reusing `teaching_pdf` allow patterns.

- [ ] **Step 3: ensure** — if reach missing, copy original bytes to reach path; ensure empty JSON attachment.

- [ ] **Step 4: read/write** attachment `reach-annotations.json`.

- [ ] **Step 5: delete** only the reach path.

- [ ] **Step 6: `cargo check` in `src-tauri`**

Expected: success.

**Note:** If embedding proves blocked mid-task, stop and record blocker — do not silently switch to a sidecar `.json` next to the PDF without updating the spec.

---

### Task 5: Store wiring

**Files:**
- Modify: `src/stores/types.ts`
- Modify: `src/stores/slices/teachingSlice.ts`

**Interfaces:**
- `freeWritePdfTool: "pen" | "eraser" | "text"`
- `freeWriteAnnotationDoc: PdfAnnotationDoc`
- `freeWriteSelectedTextId: string | null`
- `setFreeWritePdfTool`, `loadFreeWriteAnnotations`, `scheduleSaveFreeWriteAnnotations`, `flushFreeWriteAnnotations`, `clearAllFreeWriteAnnotations`, `applyFreeWriteAnnotationUpdater`

- [ ] **Step 1: Add state + actions** that call the new commands; debounce save ~400ms.

- [ ] **Step 2: On `pickTeachingPdf` / active path change** — resolve + `loadFreeWriteAnnotations`.

- [ ] **Step 3: `closeTeachingPdf`** — `flushFreeWriteAnnotations` then clear annotation state.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

---

### Task 6: Overlay + toolbar UI

**Files:**
- Create: `src/components/teaching/FreeWritePdfAnnotationOverlay.tsx`
- Modify: `src/components/teaching/FreeWritePdfPane.tsx`
- Modify: `src/i18n/en.ts` and all locales (`de`, `el`, `es`, `fr`, `it`, `pt`)

**i18n keys (minimum):**  
`freeWritePdfPen`, `freeWritePdfEraser`, `freeWritePdfTextTool`, `freeWritePdfUndo`, `freeWritePdfClearAll`, `freeWritePdfClearAllConfirm`, `freeWritePdfDeleteText`

- [ ] **Step 1: Toolbar buttons** for tools, undo, clear all, conditional trash.

- [ ] **Step 2: Overlay** positioned over page canvas; pen draws; eraser calls geometry helper; text place/drag/edit; push undo entries.

- [ ] **Step 3: First edit** calls `cmd_ensure_teaching_reach_pdf` then schedule save.

- [ ] **Step 4: Clear all** — `window.confirm(t("freeWritePdfClearAllConfirm"))` then delete command + empty doc.

- [ ] **Step 5: Route OSK into selected text** when Free write PDF text is focused (extend `freeWriteFocus` if needed, e.g. `"pdfText"`).

- [ ] **Step 6: Typecheck + unit tests**

```bash
npm test -- src/lib/teaching/reachPdfPath.test.ts src/lib/teaching/pdfAnnotations.test.ts src/lib/teaching/pdfInkGeometry.test.ts
npm run typecheck
```

---

### Task 7: Manual QA + acceptance map

- [ ] Draw → restart → open original → ink present
- [ ] Eraser does not delete text; trash does
- [ ] Text move + edit
- [ ] Undo
- [ ] Clear all removes `.reach.pdf` only
- [ ] Original file size/mtime unchanged after session
- [ ] Map spec §11 checklist to this PR

---

## Spec coverage

| Spec § | Task |
| --- | --- |
| Path identity | 1, 4 |
| JSON schema + undo | 2 |
| Brush eraser | 3, 6 |
| Rust ensure/read/write/delete | 4 |
| Overlay + tools + Clear all | 5, 6 |
| No export/appearances | constraint |
