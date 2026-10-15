# Free write PDF single document (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Free write’s multi-PDF library UX with one active document, icon-only Open/Close, filename on the toolbar, and graceful migration of old libraries — no ink or export yet.

**Architecture:** Keep `pdf-library.json` as a `TeachingPdfEntry[]` but enforce length ≤ 1 via pure helpers. Store `pickTeachingPdf` always saves `[entry]`; new `closeTeachingPdf` saves `[]`. UI in `FreeWritePdfPane` drops the recent list and Remove; toolbar matches teaching icon-button patterns (`LoadSongIcon` / `CloseIcon` from `SectionIcons`).

**Tech Stack:** React 19, Zustand, Vitest, Tauri 2 (Windows), existing pdf.js viewer (unchanged for Slice 1).

**Spec:** `docs/superpowers/specs/2026-10-15-free-write-pdf-single-document-design.md`  
**Epic:** `docs/superpowers/specs/2026-10-15-free-write-pdf-epic.md`  
**Issue:** https://github.com/pountzas/reach-Panel/issues/168  
**Next:** Slice 2 plan `docs/superpowers/plans/2026-10-15-free-write-pdf-ink.md` after this slice ships.

## Global Constraints

- Windows only; no macOS/Linux paths or stubs.
- Slice 1 only: no ink overlay, no export, no Close confirmation dialog.
- Do not commit unless the user asks.
- Prefer `TeachingLessonToolbarButton` for Open/Close (icon-only + `aria-label` via `label` prop).
- Rust `cmd_*_teaching_pdf*` commands stay unchanged in Slice 1.

## File map

| File | Role |
| --- | --- |
| `src/lib/teaching/pdfLibrary.ts` | Single-doc helpers; drop cap/upsert/remove product path |
| `src/lib/teaching/pdfLibrary.test.ts` | Unit tests for helpers |
| `src/stores/types.ts` | Swap `open`/`remove` for `closeTeachingPdf` |
| `src/stores/slices/teachingSlice.ts` | load migrate, pick replace, close clear |
| `src/components/teaching/FreeWritePdfPane.tsx` | Toolbar + drop recent/Remove |
| `src/i18n/en.ts` (+ `de`, `el`, `es`, `fr`, `it`, `pt`) | Add `freeWriteClosePdf`; remove unused keys |
| `src/lib/teaching/index.ts` | Re-exports (unchanged pattern: `export * from "./pdfLibrary"`) |

No new Rust files. No changes to `teaching_pdf.rs` unless a compile break surfaces (should not).

---

### Task 1: Single-document PDF helpers (TDD)

**Files:**
- Modify: `src/lib/teaching/pdfLibrary.ts`
- Modify: `src/lib/teaching/pdfLibrary.test.ts`

**Interfaces:**
- Produces:
  - `TeachingPdfEntry` (unchanged shape)
  - `sortTeachingPdfEntriesByRecent(entries: TeachingPdfEntry[]): TeachingPdfEntry[]`
  - `migrateToSingleTeachingPdf(entries: TeachingPdfEntry[]): { entries: TeachingPdfEntry[]; didMigrate: boolean }`
  - `replaceTeachingPdf(entry: TeachingPdfEntry): TeachingPdfEntry[]` → always `[entry]`
  - `clearTeachingPdf(): TeachingPdfEntry[]` → `[]`
- Removes from product path: `TEACHING_PDF_LIBRARY_CAP`, `upsertTeachingPdfEntry`, `removeTeachingPdfEntry`

- [ ] **Step 1: Rewrite tests for the new helpers (fail until implementation matches)**

Replace `src/lib/teaching/pdfLibrary.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  clearTeachingPdf,
  migrateToSingleTeachingPdf,
  replaceTeachingPdf,
  sortTeachingPdfEntriesByRecent,
} from "./pdfLibrary";

const base = (
  id: string,
  lastOpenedAt: string,
  path = `C:\\docs\\${id}.pdf`,
) => ({
  id,
  title: `${id}.pdf`,
  path,
  lastOpenedAt,
});

describe("sortTeachingPdfEntriesByRecent", () => {
  it("orders by lastOpenedAt descending", () => {
    const sorted = sortTeachingPdfEntriesByRecent([
      base("a", "2026-01-01T00:00:00.000Z"),
      base("b", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("migrateToSingleTeachingPdf", () => {
  it("keeps empty as empty without migrate flag", () => {
    expect(migrateToSingleTeachingPdf([])).toEqual({
      entries: [],
      didMigrate: false,
    });
  });

  it("keeps a single entry without migrate flag", () => {
    const one = [base("a", "2026-01-01T00:00:00.000Z")];
    expect(migrateToSingleTeachingPdf(one)).toEqual({
      entries: one,
      didMigrate: false,
    });
  });

  it("keeps most recent when multiple; didMigrate true", () => {
    const result = migrateToSingleTeachingPdf([
      base("old", "2026-01-01T00:00:00.000Z"),
      base("mid", "2026-03-01T00:00:00.000Z"),
      base("new", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(result.didMigrate).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("new");
  });

  it("breaks lastOpenedAt ties by id ascending", () => {
    const result = migrateToSingleTeachingPdf([
      base("b", "2026-08-20T00:00:00.000Z"),
      base("a", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(result.entries[0].id).toBe("a");
    expect(result.didMigrate).toBe(true);
  });
});

describe("replaceTeachingPdf", () => {
  it("returns a one-element library", () => {
    const entry = base("x", "2026-08-20T00:00:00.000Z");
    expect(replaceTeachingPdf(entry)).toEqual([entry]);
  });
});

describe("clearTeachingPdf", () => {
  it("returns empty library", () => {
    expect(clearTeachingPdf()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (missing exports)**

Run: `npm test -- src/lib/teaching/pdfLibrary.test.ts`

Expected: FAIL importing `migrateToSingleTeachingPdf` / `replaceTeachingPdf` / `clearTeachingPdf` (or similar).

- [ ] **Step 3: Implement helpers**

Replace `src/lib/teaching/pdfLibrary.ts` with:

```ts
export type TeachingPdfEntry = {
  id: string;
  title: string;
  path: string;
  lastOpenedAt: string;
};

export function sortTeachingPdfEntriesByRecent(
  entries: TeachingPdfEntry[],
): TeachingPdfEntry[] {
  return [...entries].sort((a, b) => {
    const byTime = b.lastOpenedAt.localeCompare(a.lastOpenedAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

/** Cap legacy multi-entry libraries to the single most recent document. */
export function migrateToSingleTeachingPdf(entries: TeachingPdfEntry[]): {
  entries: TeachingPdfEntry[];
  didMigrate: boolean;
} {
  if (entries.length <= 1) {
    return { entries, didMigrate: false };
  }
  const [kept] = sortTeachingPdfEntriesByRecent(entries);
  return { entries: kept ? [kept] : [], didMigrate: true };
}

export function replaceTeachingPdf(entry: TeachingPdfEntry): TeachingPdfEntry[] {
  return [entry];
}

export function clearTeachingPdf(): TeachingPdfEntry[] {
  return [];
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/lib/teaching/pdfLibrary.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/lib/teaching/pdfLibrary.ts src/lib/teaching/pdfLibrary.test.ts
git commit -m "refactor(teaching): single-document PDF library helpers"
```

---

### Task 2: Store API — migrate on load, replace on open, close clears

**Files:**
- Modify: `src/stores/types.ts` (TeachingSlice PDF actions)
- Modify: `src/stores/slices/teachingSlice.ts`

**Interfaces:**
- Consumes: `migrateToSingleTeachingPdf`, `replaceTeachingPdf`, `clearTeachingPdf`, `teachingPdfFileName`
- Produces on `AppState` / TeachingSlice:
  - `loadTeachingPdfLibrary: () => Promise<void>` (migrates + optional save)
  - `pickTeachingPdf: () => Promise<void>` (saves `[entry]`)
  - `closeTeachingPdf: () => Promise<void>` (saves `[]`, clears ids)
- Removes: `openTeachingPdf`, `removeTeachingPdf`

- [ ] **Step 1: Update `src/stores/types.ts` action signatures**

In the TeachingSlice interface, replace:

```ts
  loadTeachingPdfLibrary: () => Promise<void>;
  pickTeachingPdf: () => Promise<void>;
  openTeachingPdf: (id: string) => Promise<void>;
  removeTeachingPdf: (id: string) => Promise<void>;
```

with:

```ts
  loadTeachingPdfLibrary: () => Promise<void>;
  pickTeachingPdf: () => Promise<void>;
  closeTeachingPdf: () => Promise<void>;
```

- [ ] **Step 2: Update imports in `teachingSlice.ts`**

Change the teaching lib import from:

```ts
import { clampFreeWriteZoom, isFreeWriteCaptureActive, removeTeachingPdfEntry, upsertTeachingPdfEntry } from "../../lib/teaching";
```

to:

```ts
import {
  clampFreeWriteZoom,
  clearTeachingPdf,
  isFreeWriteCaptureActive,
  migrateToSingleTeachingPdf,
  replaceTeachingPdf,
} from "../../lib/teaching";
```

(`TeachingPdfEntry` type import path stays whatever the file already uses.)

- [ ] **Step 3: Replace `loadTeachingPdfLibrary` body**

```ts
  loadTeachingPdfLibrary: async () => {
    try {
      const raw = await invoke<TeachingPdfEntry[]>(
        "cmd_list_teaching_pdfs",
      );
      const filtered = Array.isArray(raw)
        ? raw.filter(
            (e) => e && typeof e.id === "string" && typeof e.path === "string",
          )
        : [];
      const { entries, didMigrate } = migrateToSingleTeachingPdf(filtered);
      if (didMigrate) {
        await invoke("cmd_save_teaching_pdfs", { entries });
      }
      const kept = entries[0] ?? null;
      const lastId = get().settings.freeWriteLastPdfId ?? null;
      const freeWriteActivePdfId =
        kept == null
          ? null
          : lastId === kept.id
            ? lastId
            : kept.id;
      set({ teachingPdfLibrary: entries, freeWriteActivePdfId });
      if (kept && lastId !== kept.id) {
        await get().updateSettings({ freeWriteLastPdfId: kept.id });
      }
      if (!kept && lastId) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
```

- [ ] **Step 4: Replace `pickTeachingPdf` to always save one entry**

```ts
  pickTeachingPdf: async () => {
    try {
      const path = await invoke<string | null>("cmd_pick_teaching_pdf");
      if (!path) return;
      const existing = get().teachingPdfLibrary.find((e) => e.path === path);
      const entry: TeachingPdfEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        title: teachingPdfFileName(path),
        path,
        lastOpenedAt: new Date().toISOString(),
      };
      const teachingPdfLibrary = replaceTeachingPdf(entry);
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      set({ teachingPdfLibrary, freeWriteActivePdfId: entry.id });
      await get().updateSettings({ freeWriteLastPdfId: entry.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
```

- [ ] **Step 5: Remove `openTeachingPdf` / `removeTeachingPdf`; add `closeTeachingPdf`**

Delete the `openTeachingPdf` and `removeTeachingPdf` implementations. Add:

```ts
  closeTeachingPdf: async () => {
    try {
      const teachingPdfLibrary = clearTeachingPdf();
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      set({ teachingPdfLibrary, freeWriteActivePdfId: null });
      if (get().settings.freeWriteLastPdfId) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: errors only in `FreeWritePdfPane.tsx` still referencing `openTeachingPdf` / `removeTeachingPdf` (fixed in Task 4). If other files reference those actions, update them the same way (grep first).

Grep: `openTeachingPdf|removeTeachingPdf|upsertTeachingPdfEntry|removeTeachingPdfEntry|TEACHING_PDF_LIBRARY_CAP`

Expected after Task 4: no matches outside git history / docs.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/stores/types.ts src/stores/slices/teachingSlice.ts
git commit -m "feat(teaching): single active PDF store load/open/close"
```

---

### Task 3: i18n — Close label; drop Recent/Remove strings

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/de.ts`
- Modify: `src/i18n/el.ts`
- Modify: `src/i18n/es.ts`
- Modify: `src/i18n/fr.ts`
- Modify: `src/i18n/it.ts`
- Modify: `src/i18n/pt.ts`

**Interfaces:**
- Produces: `freeWriteClosePdf: string` on every locale object (keys must match `en` for `TranslationKey`)
- Removes: `freeWriteRecentPdfs`, `freeWriteRemovePdf` from every locale

- [ ] **Step 1: Update English**

In `src/i18n/en.ts`, around the free-write PDF keys:

- Keep `freeWriteOpenPdf` (value may stay `"Open PDF…"` — used as accessible name / tooltip only).
- Remove `freeWriteRecentPdfs` and `freeWriteRemovePdf`.
- Add `freeWriteClosePdf: "Close PDF",` next to the other free-write PDF keys.

- [ ] **Step 2: Mirror in all other locales**

| Locale | `freeWriteClosePdf` |
| --- | --- |
| `de` | `"PDF schließen"` |
| `el` | `"Κλείσιμο PDF"` |
| `es` | `"Cerrar PDF"` |
| `fr` | `"Fermer le PDF"` |
| `it` | `"Chiudi PDF"` |
| `pt` | `"Fechar PDF"` |

Remove `freeWriteRecentPdfs` and `freeWriteRemovePdf` from each of those files as well.

- [ ] **Step 3: Commit (only if user asked)**

```bash
git add src/i18n/*.ts
git commit -m "i18n: free write Close PDF; drop recent/remove strings"
```

---

### Task 4: `FreeWritePdfPane` toolbar UX

**Files:**
- Modify: `src/components/teaching/FreeWritePdfPane.tsx`

**Interfaces:**
- Consumes: `pickTeachingPdf`, `closeTeachingPdf`, `loadTeachingPdfLibrary`, `teachingPdfLibrary`, `freeWriteActivePdfId`
- Icons: `LoadSongIcon` (open folder+), `CloseIcon` from `src/components/common/SectionIcons.tsx`
- Does not consume: `openTeachingPdf`, `removeTeachingPdf`, `sortTeachingPdfEntriesByRecent` (optional: still fine to read `teachingPdfLibrary[0]`)

- [ ] **Step 1: Wire store + derive active entry**

```ts
const teachingPdfLibrary = useAppStore((s) => s.teachingPdfLibrary);
const freeWriteActivePdfId = useAppStore((s) => s.freeWriteActivePdfId);
const loadTeachingPdfLibrary = useAppStore((s) => s.loadTeachingPdfLibrary);
const pickTeachingPdf = useAppStore((s) => s.pickTeachingPdf);
const closeTeachingPdf = useAppStore((s) => s.closeTeachingPdf);
const setFreeWriteFocus = useAppStore((s) => s.setFreeWriteFocus);

const active =
  teachingPdfLibrary.find((e) => e.id === freeWriteActivePdfId) ??
  teachingPdfLibrary[0] ??
  null;
const activePath = active?.path ?? null;
```

Remove `useMemo` + `sortTeachingPdfEntriesByRecent` import if unused.

- [ ] **Step 2: Replace the top toolbar row**

Use this structure (keep existing page/zoom handlers and surface colors):

```tsx
const TOOLBAR_ICON_CLASS = "h-5 w-5";

{/* imports at top of file: */}
import { CloseIcon, LoadSongIcon } from "../common/SectionIcons";

<div className="flex shrink-0 flex-wrap items-center gap-1">
  <TeachingLessonToolbarButton
    label={t("freeWriteOpenPdf")}
    onClick={() => void pickTeachingPdf()}
    backgroundColor={surface.panelBg}
    borderColor={surface.panelBorder}
    color={surface.panelText}
  >
    <LoadSongIcon className={TOOLBAR_ICON_CLASS} />
  </TeachingLessonToolbarButton>
  {active ? (
    <TeachingLessonToolbarButton
      label={t("freeWriteClosePdf")}
      onClick={() => void closeTeachingPdf()}
      backgroundColor={surface.panelBg}
      borderColor={surface.panelBorder}
      color={surface.panelText}
    >
      <CloseIcon className={TOOLBAR_ICON_CLASS} />
    </TeachingLessonToolbarButton>
  ) : null}
  <TeachingLessonToolbarButton
    label={t("freeWritePdfPrevPage")}
    onClick={() => setPage((p) => Math.max(1, p - 1))}
    disabled={page <= 1}
    backgroundColor={surface.panelBg}
    borderColor={surface.panelBorder}
    color={surface.panelText}
  >
    <span className="text-sm">◀</span>
  </TeachingLessonToolbarButton>
  <span className="text-xs" style={{ color: surface.panelMutedText }}>
    {pageCount > 0 ? `${page} / ${pageCount}` : "—"}
  </span>
  <TeachingLessonToolbarButton
    label={t("freeWritePdfNextPage")}
    onClick={() => setPage((p) => Math.min(pageCount || 1, p + 1))}
    disabled={!pageCount || page >= pageCount}
    backgroundColor={surface.panelBg}
    borderColor={surface.panelBorder}
    color={surface.panelText}
  >
    <span className="text-sm">▶</span>
  </TeachingLessonToolbarButton>
  <TeachingLessonToolbarButton
    label={t("freeWriteZoomOut")}
    onClick={() => setViewerZoom((z) => Math.max(50, z - 25))}
    backgroundColor={surface.panelBg}
    borderColor={surface.panelBorder}
    color={surface.panelText}
  >
    <span className="text-lg leading-none">−</span>
  </TeachingLessonToolbarButton>
  <TeachingLessonToolbarButton
    label={t("freeWriteZoomIn")}
    onClick={() => setViewerZoom((z) => Math.min(250, z + 25))}
    backgroundColor={surface.panelBg}
    borderColor={surface.panelBorder}
    color={surface.panelText}
  >
    <span className="text-lg leading-none">+</span>
  </TeachingLessonToolbarButton>
  {active ? (
    <span
      className="min-w-0 max-w-[12rem] truncate text-xs"
      style={{ color: surface.panelText }}
      title={active.path}
    >
      {active.title}
    </span>
  ) : null}
</div>
```

- [ ] **Step 3: Delete the entire “Recent PDFs” block**

Remove the `{recent.length > 0 ? ( … ) : null}` section (list + Remove buttons).

- [ ] **Step 4: Simplify missing-file error UI**

In the `error` branch, remove the Remove button. Keep missing copy + optional technical message. User clears via Close (toolbar) or replaces via Open.

Example error branch:

```tsx
{error ? (
  <div className="space-y-2 text-sm" style={{ color: surface.panelText }}>
    <p>{t("freeWritePdfMissing")}</p>
    <p className="text-xs" style={{ color: surface.panelMutedText }}>
      {error}
    </p>
  </div>
) : !active ? (
  ...
) : (
  <canvas ref={setCanvasNode} className="mx-auto block max-w-full" />
)}
```

- [ ] **Step 5: On successful open of a different path, reset page to 1**

In the document-load effect, when `activePath` changes, after a successful load set page appropriately. Today it clamps; also reset when path changes:

At the start of a successful load (after `setPageCount`), use:

```ts
setPage(1);
```

instead of only clamping previous page — so replacing a document does not keep an old page index. (Clamping remains fine as a safety net if you prefer `setPage((prev) => Math.min(...))` only when path unchanged; simplest Slice 1 rule: **always `setPage(1)` on new successful document load**.)

- [ ] **Step 6: Typecheck + unit tests**

Run:

```bash
npm test -- src/lib/teaching/pdfLibrary.test.ts
npm run typecheck
```

Expected: tests PASS; `tsc` clean.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/components/teaching/FreeWritePdfPane.tsx src/i18n/*.ts src/stores/types.ts src/stores/slices/teachingSlice.ts src/lib/teaching/pdfLibrary.ts src/lib/teaching/pdfLibrary.test.ts
git commit -m "feat(teaching): single-PDF free write toolbar and close"
```

---

### Task 5: Spec status + acceptance self-check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-free-write-pdf-single-document-design.md` (status line only)

- [ ] **Step 1: Mark spec approved/implemented for Slice 1**

Change header `**Status:** Draft for review` → `**Status:** Approved for implementation` (or `Implemented` once the PR lands — use Approved until merge).

- [ ] **Step 2: Grep dead API**

```bash
rg "openTeachingPdf|removeTeachingPdf|freeWriteRecentPdfs|freeWriteRemovePdf|TEACHING_PDF_LIBRARY_CAP|upsertTeachingPdfEntry|removeTeachingPdfEntry" src
```

Expected: no matches under `src/`.

- [ ] **Step 3: Manual QA checklist (human or Computer Use)**

- [ ] Open PDF → icon-only Open; filename right of zoom; no Recent list; no Remove
- [ ] Open second PDF → first replaced
- [ ] Close → empty state; Open works again
- [ ] Missing path → error text; Close clears; Open replaces
- [ ] (If test data available) Old multi-entry `pdf-library.json` → after load, one entry on disk

- [ ] **Step 4: Map acceptance (Slice 1)**

| Spec §10 | Covered by |
| --- | --- |
| One PDF; Open replaces; no recent list | Tasks 2 + 4 |
| Icon-only Open + accessible label | Task 4 |
| Filename right of zoom | Task 4 |
| Close; no Remove | Tasks 2–4 |
| Migration most recent | Tasks 1–2 |
| Tests for helpers | Task 1 |
| Ink/export deferred | No code in this plan |

---

## Spec coverage (plan self-review)

| Spec requirement | Task |
| --- | --- |
| Approach 1 / length ≤ 1 | 1, 2 |
| Migration on load + rewrite | 2 |
| Close immediate, no confirm | 2, 4 |
| Toolbar order Open, Close, nav, zoom, filename | 4 |
| i18n close + drop recent/remove | 3 |
| Rust unchanged | (constraint) |
| Ink/export out of scope | (non-goals) |

No TBD/placeholder steps remain. Helper and store names are consistent across tasks (`migrateToSingleTeachingPdf`, `replaceTeachingPdf`, `clearTeachingPdf`, `closeTeachingPdf`).
