# Free write PDF export & appearances (Slice 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users export a page range to a new `.reach.pdf` (JSON + appearances) and regenerate appearances whenever the full sibling is saved.

**Architecture:** Pure TS helpers for range validation and annotation remap; Rust export command copies selected pages, embeds filtered JSON, draws appearances; sibling write path from Slice 2 calls the same appearance helper; small Export dialog in the Free write PDF toolbar.

**Tech Stack:** React 19, Zustand, Vitest, Tauri 2 (Windows), Rust PDF stack from Slice 2.

**Spec:** `docs/superpowers/specs/2026-10-15-free-write-pdf-export-design.md`  
**Epic:** `docs/superpowers/specs/2026-10-15-free-write-pdf-epic.md`  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Depends on:** Slice 2 ink/sibling JSON working on the branch.

## Global Constraints

- Windows only.
- Never modify or delete the original `name.pdf`.
- Export must not replace the full `name.reach.pdf` with a subset.
- Do not commit unless the user asks.

## File map

| File | Role |
| --- | --- |
| `src/lib/teaching/pdfExportRange.ts` | Range normalize + annotation remap |
| `src/lib/teaching/pdfExportRange.test.ts` | Unit tests |
| `src-tauri/src/teaching_pdf_reach.rs` (or appearances module) | Appearances + export command |
| `src-tauri/src/lib.rs` | Register commands |
| `src/components/teaching/FreeWritePdfExportDialog.tsx` | From/To/All/Current UI |
| `src/components/teaching/FreeWritePdfPane.tsx` | Export button + dialog host |
| `src/stores/slices/teachingSlice.ts` | `exportTeachingReachPdf` action |
| `src/i18n/*.ts` | Export strings |

---

### Task 1: Page range + annotation remap (TDD)

**Files:**
- Create: `src/lib/teaching/pdfExportRange.ts`
- Create: `src/lib/teaching/pdfExportRange.test.ts`
- Modify: `src/lib/teaching/index.ts` (re-export)

**Interfaces:**
- `normalizeExportPageRange(input: { from: number; to: number; pageCount: number }): { from: number; to: number } | { error: string }`
- `rangeForAllPages(pageCount: number): { from: number; to: number }`
- `rangeForCurrentPage(page: number, pageCount: number): { from: number; to: number } | { error: string }`
- `filterAndRemapAnnotations(doc: PdfAnnotationDoc, from: number, to: number): PdfAnnotationDoc`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  filterAndRemapAnnotations,
  normalizeExportPageRange,
  rangeForAllPages,
  rangeForCurrentPage,
} from "./pdfExportRange";
import { emptyPdfAnnotationDoc } from "./pdfAnnotations";

describe("normalizeExportPageRange", () => {
  it("accepts inclusive in-range bounds", () => {
    expect(normalizeExportPageRange({ from: 4, to: 12, pageCount: 50 })).toEqual({
      from: 4,
      to: 12,
    });
  });

  it("rejects from > to", () => {
    expect(normalizeExportPageRange({ from: 5, to: 2, pageCount: 10 })).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("rejects out of range", () => {
    expect(normalizeExportPageRange({ from: 0, to: 2, pageCount: 10 })).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});

describe("range helpers", () => {
  it("all pages", () => {
    expect(rangeForAllPages(50)).toEqual({ from: 1, to: 50 });
  });

  it("current page", () => {
    expect(rangeForCurrentPage(7, 50)).toEqual({ from: 7, to: 7 });
  });
});

describe("filterAndRemapAnnotations", () => {
  it("remaps pages 4 and 12 into 1 and 9 when exporting 4..12", () => {
    const doc = emptyPdfAnnotationDoc();
    doc.pages["4"] = {
      strokes: [
        {
          id: "a",
          color: "#000000",
          width: 0.002,
          points: [[0.1, 0.1]],
        },
      ],
      texts: [],
    };
    doc.pages["12"] = {
      strokes: [],
      texts: [{ id: "t", x: 0.2, y: 0.3, w: 0.4, body: "hi" }],
    };
    doc.pages["3"] = {
      strokes: [
        {
          id: "skip",
          color: "#000000",
          width: 0.002,
          points: [[0, 0]],
        },
      ],
      texts: [],
    };
    const out = filterAndRemapAnnotations(doc, 4, 12);
    expect(Object.keys(out.pages).sort()).toEqual(["1", "9"]);
    expect(out.pages["1"].strokes[0].id).toBe("a");
    expect(out.pages["9"].texts[0].body).toBe("hi");
    expect(out.pages["3"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- src/lib/teaching/pdfExportRange.test.ts`

- [ ] **Step 3: Implement helpers**

`filterAndRemapAnnotations`: for each source page `p` in `from..to`, if `doc.pages[String(p)]` exists, assign to `String(p - from + 1)` (deep clone strokes/texts).

- [ ] **Step 4: Green**

---

### Task 2: Appearance generation (Rust)

**Files:**
- Modify: Slice 2 reach PDF module(s)
- Possibly create: `src-tauri/src/teaching_pdf_appearances.rs`

**Interfaces:**
- `apply_reach_appearances(doc_bytes_or_path, annotations: &AnnotationDoc) -> Result<()>`  
  Draws visible ink/text for each annotated page (vector paths + text operators or annotation appearance streams).

- [ ] **Step 1: Implement appearance writer** using the same PDF crate as Slice 2.

- [ ] **Step 2: Call from `write_reach_annotations`** after JSON attachment update.

- [ ] **Step 3: If appearances fail after JSON ok** — return a structured warning or Err that the frontend can show without discarding JSON success (match spec §7).

- [ ] **Step 4: `cargo check`**

---

### Task 3: Export command (Rust)

**Files:**
- Modify: reach PDF module + `lib.rs`

**Interfaces:**
- `cmd_pick_teaching_reach_export_path({ suggestedName: string }) -> Option<string>`
- `cmd_export_teaching_reach_pdf({ sourcePath: string, fromPage: u32, toPage: u32, destPath: string }) -> Result<()>`

- [ ] **Step 1: Save dialog** for destination path (PDF filter).

- [ ] **Step 2: Export pipeline** per spec §6 — copy pages, remap JSON (can remap in Rust or accept pre-remapped JSON from frontend; **prefer remap in one place** — if TS already remaps for preview, pass remapped JSON + page list to Rust, **or** pass from/to and remap in Rust. **Chosen for this plan:** pass `fromPage`/`toPage` and let **Rust** filter/remap + write so the file on disk is authoritative.)

- [ ] **Step 3: Embed JSON + apply appearances on the export file.**

- [ ] **Step 4: Allowlist dest write** only for user-picked save path; allowlist source via existing teaching PDF rules.

- [ ] **Step 5: `cargo check`**

---

### Task 4: Export dialog UI + store action

**Files:**
- Create: `src/components/teaching/FreeWritePdfExportDialog.tsx`
- Modify: `src/components/teaching/FreeWritePdfPane.tsx`
- Modify: `src/stores/types.ts`, `teachingSlice.ts`
- Modify: `src/i18n/*.ts`

**Interfaces:**
- `exportTeachingReachPdf: (from: number, to: number) => Promise<void>`  
  Flushes pending save → pick dest → invoke export command.

- [ ] **Step 1: Add i18n keys** from spec §9 to `en` and all locales.

- [ ] **Step 2: Dialog** with From/To number inputs, All, Current, Export, Cancel. Use `normalizeExportPageRange` before invoke; show error string on failure.

- [ ] **Step 3: Suggested filename** helper:

```ts
function suggestedExportFileName(
  originalPath: string,
  from: number,
  to: number,
): string {
  const base = /* basename without .pdf / .reach.pdf */;
  if (from === to) return `${base}-page-${from}.reach.pdf`;
  return `${base}-pages-${from}-${to}.reach.pdf`;
}
```

Unit-test this helper in `pdfExportRange.test.ts` or a tiny adjacent test.

- [ ] **Step 4: Toolbar Export button** opens dialog when `active` document exists.

- [ ] **Step 5: Store action** flush → pick path → `cmd_export_teaching_reach_pdf` → toast success / error.

- [ ] **Step 6: Typecheck + unit tests**

```bash
npm test -- src/lib/teaching/pdfExportRange.test.ts
npm run typecheck
```

---

### Task 5: Manual QA + acceptance map

- [ ] Export 4–12 → page count 9 in ReachPanel
- [ ] Edit ink on export → persists on that file
- [ ] Edge (or similar) shows appearances on export
- [ ] After draw+save on full sibling, Edge shows appearances
- [ ] Full `name.reach.pdf` still has all pages after export
- [ ] Original untouched
- [ ] Map spec §12 checklist to the PR

---

## Spec coverage

| Spec § | Task |
| --- | --- |
| Dialog From/To/All/Current | 4 |
| Range validation + remap | 1 |
| Export pipeline | 3 |
| Appearances on sibling save | 2 |
| Appearances on export | 2, 3 |
| Open export editable | 3 + Slice 2 open path |
| Tests | 1, 4, 5 |
