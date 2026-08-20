# Teaching Free Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Language subject tabs (Spelling | Free write) with a notepad + PDF Free write workspace, reusable tab shell, per-profile notepad prefs, and a persisted PDF library — without changing Music/Math chrome.

**Architecture:** Wrap Language teaching content in `TeachingSubjectShell` + `TeachingSubjectTabs`. Spelling keeps `LanguageLessonPanel`. Free write reuses `TeachingLessonPanel` (notepad left, PDF right). Session state owns `languageSubjectTab` / `freeWriteFocus`; profile settings own notepad draft, zoom, wrap, line numbers, split ratio, last PDF id. Rust mirrors the music import pattern for PDF pick/read + JSON library under app data. Keyboard capture extends the language gate so Free write routes keys into the notepad buffer (PDF field typing deferred to viewer native focus when available).

**Tech Stack:** React 19, Zustand, Vitest, Tauri 2 (rfd dialogs), `pdfjs-dist` (bundled worker; CSP stays `'self'` + `blob:` for worker), existing `TeachingLessonPanel` / language keyboard capture.

## Global Constraints

- Windows-only; no macOS/Linux paths or stubs.
- Teaching remains host-only (no companion Free write).
- Do not add Free write as a fourth header subject icon — tabs under Language only.
- Music declares zero tabs (strip hidden); Math declares none for now.
- Leaving Spelling → Free write (or leaving Language) **stops** language Play (`stopLanguageLessonPlayback`).
- Free write capture must not inject into external apps and must not update the spelling buffer.
- i18n: add keys to `en.ts` first, mirror in `de`, `el`, `es`, `fr`, `it`, `pt`.
- README Teaching bullet must mention Language Free write when shipping.
- PDF library is **global** app-data JSON (`teaching/pdf-library.json`); notepad draft + zoom/wrap/lineNumbers/leftRatio/lastActivePdfId are **per-profile** settings.
- Cap PDF library at **20** entries by oldest `lastOpenedAt`.
- Prefer TDD for pure helpers; UI wiring follows existing Language/Music patterns.

**Spec:** `docs/superpowers/specs/2026-08-20-teaching-free-write-design.md`

**Branch:** continue on `feature/language-lesson-phase1` (do not recreate from `dev` unless the human asks).

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/components/teaching/TeachingSubjectTabs.tsx` | Horizontal tab strip UI |
| `src/components/teaching/TeachingSubjectShell.tsx` | Optional tabs + children |
| `src/components/teaching/FreeWritePanel.tsx` | Notepad \| PDF split |
| `src/components/teaching/FreeWriteNotepad.tsx` | Editor + toolbar |
| `src/components/teaching/FreeWritePdfPane.tsx` | Open / recent / viewer |
| `src/lib/teaching/pdfLibrary.ts` | Cap/add/remove/upsert helpers |
| `src/lib/teaching/pdfLibrary.test.ts` | Unit tests |
| `src/lib/teaching/isFreeWriteCaptureActive.ts` | Capture predicate |
| `src/lib/teaching/isFreeWriteCaptureActive.test.ts` | Unit tests |
| `src/lib/types.ts` | Profile settings fields |
| `src/stores/appStore.ts` | Session + actions + persistence wiring |
| `src/components/layout/AppShell.tsx` | Mount Language shell |
| `src/components/keyboard/Keyboard.tsx` | On-screen Free write routing |
| `src/hooks/useLanguageLessonPhysicalKeyboard.ts` | Extend / split Free write physical capture |
| `src-tauri/src/teaching_pdf.rs` | Library + pick/read allowlist |
| `src-tauri/src/lib.rs` | Register commands |
| `src/i18n/*.ts` | New keys |
| `README.md` | Teaching bullet |
| `package.json` | Add `pdfjs-dist` |
| `src-tauri/tauri.conf.json` | CSP `worker-src 'self' blob:` if needed |

---

### Task 1: PDF library helpers + Free write capture predicates

**Files:**
- Create: `src/lib/teaching/pdfLibrary.ts`
- Create: `src/lib/teaching/pdfLibrary.test.ts`
- Create: `src/lib/teaching/isFreeWriteCaptureActive.ts`
- Create: `src/lib/teaching/isFreeWriteCaptureActive.test.ts`
- Create: `src/lib/teaching/index.ts`

**Interfaces:**
- Produces:
  - `TeachingPdfEntry` type
  - `TEACHING_PDF_LIBRARY_CAP = 20`
  - `upsertTeachingPdfEntry(entries, entry): TeachingPdfEntry[]`
  - `removeTeachingPdfEntry(entries, id): TeachingPdfEntry[]`
  - `sortTeachingPdfEntriesByRecent(entries): TeachingPdfEntry[]`
  - `LanguageSubjectTab = "spelling" | "freeWrite"`
  - `FreeWriteFocus = "notepad" | "pdf"`
  - `isFreeWriteCaptureActive(input): boolean`
  - `isLanguageSpellingTabActive(input): boolean` (language subject + spelling tab)

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/teaching/pdfLibrary.test.ts
import { describe, expect, it } from "vitest";
import {
  TEACHING_PDF_LIBRARY_CAP,
  removeTeachingPdfEntry,
  upsertTeachingPdfEntry,
} from "./pdfLibrary";

const base = (id: string, lastOpenedAt: string) => ({
  id,
  title: `${id}.pdf`,
  path: `C:\\docs\\${id}.pdf`,
  lastOpenedAt,
});

describe("upsertTeachingPdfEntry", () => {
  it("updates existing path by id and bumps lastOpenedAt", () => {
    const next = upsertTeachingPdfEntry(
      [base("a", "2026-01-01T00:00:00.000Z")],
      base("a", "2026-08-20T12:00:00.000Z"),
    );
    expect(next).toHaveLength(1);
    expect(next[0].lastOpenedAt).toBe("2026-08-20T12:00:00.000Z");
  });

  it("caps at TEACHING_PDF_LIBRARY_CAP dropping oldest lastOpenedAt", () => {
    const seeded = Array.from({ length: TEACHING_PDF_LIBRARY_CAP }, (_, i) =>
      base(`id-${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const next = upsertTeachingPdfEntry(
      seeded,
      base("new", "2026-08-20T00:00:00.000Z"),
    );
    expect(next).toHaveLength(TEACHING_PDF_LIBRARY_CAP);
    expect(next.find((e) => e.id === "id-0")).toBeUndefined();
    expect(next.find((e) => e.id === "new")).toBeTruthy();
  });
});

describe("removeTeachingPdfEntry", () => {
  it("removes by id", () => {
    expect(removeTeachingPdfEntry([base("a", "2026-01-01T00:00:00.000Z")], "a")).toEqual([]);
  });
});
```

```ts
// src/lib/teaching/isFreeWriteCaptureActive.test.ts
import { describe, expect, it } from "vitest";
import {
  isFreeWriteCaptureActive,
  isLanguageSpellingTabActive,
} from "./isFreeWriteCaptureActive";

const base = {
  musicTeachingEnabled: true,
  teachingLesson: "language" as const,
  settings: { keyboardSectionMode: "synthesizer" },
  languageSubjectTab: "freeWrite" as const,
  freeWriteFocus: "notepad" as const,
};

describe("isFreeWriteCaptureActive", () => {
  it("is true on Language + Free write + notepad focus", () => {
    expect(isFreeWriteCaptureActive(base)).toBe(true);
  });

  it("is false on Spelling tab", () => {
    expect(
      isFreeWriteCaptureActive({ ...base, languageSubjectTab: "spelling" }),
    ).toBe(false);
  });

  it("is false when Music subject", () => {
    expect(
      isFreeWriteCaptureActive({ ...base, teachingLesson: "music" }),
    ).toBe(false);
  });
});

describe("isLanguageSpellingTabActive", () => {
  it("requires language + spelling tab", () => {
    expect(
      isLanguageSpellingTabActive({
        ...base,
        languageSubjectTab: "spelling",
      }),
    ).toBe(true);
    expect(isLanguageSpellingTabActive(base)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/lib/teaching/pdfLibrary.test.ts src/lib/teaching/isFreeWriteCaptureActive.test.ts`
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement**

```ts
// src/lib/teaching/pdfLibrary.ts
export const TEACHING_PDF_LIBRARY_CAP = 20;

export type TeachingPdfEntry = {
  id: string;
  title: string;
  path: string;
  lastOpenedAt: string;
};

export function sortTeachingPdfEntriesByRecent(
  entries: TeachingPdfEntry[],
): TeachingPdfEntry[] {
  return [...entries].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
}

export function upsertTeachingPdfEntry(
  entries: TeachingPdfEntry[],
  entry: TeachingPdfEntry,
): TeachingPdfEntry[] {
  const without = entries.filter((e) => e.id !== entry.id && e.path !== entry.path);
  const next = [...without, entry];
  return sortTeachingPdfEntriesByRecent(next).slice(0, TEACHING_PDF_LIBRARY_CAP);
}

export function removeTeachingPdfEntry(
  entries: TeachingPdfEntry[],
  id: string,
): TeachingPdfEntry[] {
  return entries.filter((e) => e.id !== id);
}
```

```ts
// src/lib/teaching/isFreeWriteCaptureActive.ts
export type LanguageSubjectTab = "spelling" | "freeWrite";
export type FreeWriteFocus = "notepad" | "pdf";

export type FreeWriteModeInput = {
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
  settings: { keyboardSectionMode?: string };
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
};

export function isLanguageSubjectActive(input: FreeWriteModeInput): boolean {
  return (
    input.musicTeachingEnabled &&
    input.settings.keyboardSectionMode === "synthesizer" &&
    input.teachingLesson === "language"
  );
}

export function isLanguageSpellingTabActive(input: FreeWriteModeInput): boolean {
  return isLanguageSubjectActive(input) && input.languageSubjectTab === "spelling";
}

/** Capture for Free write notepad (v1: notepad focus only; PDF uses native field focus when available). */
export function isFreeWriteCaptureActive(input: FreeWriteModeInput): boolean {
  return (
    isLanguageSubjectActive(input) &&
    input.languageSubjectTab === "freeWrite" &&
    input.freeWriteFocus === "notepad"
  );
}
```

```ts
// src/lib/teaching/index.ts
export * from "./pdfLibrary";
export * from "./isFreeWriteCaptureActive";
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/teaching/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/teaching
git commit -m "feat: add Free write PDF library helpers and capture predicates"
```

---

### Task 2: Profile settings fields for Free write

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/stores/appStore.ts` (only if defaults are mirrored there — keep settings defaults in `DEFAULT_SETTINGS`)

**Interfaces:**
- Produces profile fields (all optional on load; defaults in `DEFAULT_SETTINGS`):
  - `freeWriteNotepadText: string` (default `""`)
  - `freeWriteNotepadZoom: number` (default `100`; clamp 75–200)
  - `freeWriteNotepadWrap: boolean` (default `true`)
  - `freeWriteNotepadLineNumbers: boolean` (default `true`)
  - `freeWriteLeftRatio: number` (default `0.4`)
  - `freeWriteLastPdfId: string | null` (default `null`)

- [ ] **Step 1: Add settings to `AppSettings` + `DEFAULT_SETTINGS`**

In `src/lib/types.ts`, after `musicLessonLeftRatio`:

```ts
  /** Teaching → Language → Free write: left (notepad) width fraction. */
  freeWriteLeftRatio?: number;
  /** Teaching → Language → Free write: notepad draft (plain text). */
  freeWriteNotepadText?: string;
  /** Teaching → Language → Free write: notepad zoom percent (75–200). */
  freeWriteNotepadZoom?: number;
  /** Teaching → Language → Free write: word wrap. */
  freeWriteNotepadWrap?: boolean;
  /** Teaching → Language → Free write: show line-number gutter. */
  freeWriteNotepadLineNumbers?: boolean;
  /** Teaching → Language → Free write: last opened PDF library id. */
  freeWriteLastPdfId?: string | null;
```

In `DEFAULT_SETTINGS`:

```ts
  freeWriteLeftRatio: 0.4,
  freeWriteNotepadText: "",
  freeWriteNotepadZoom: 100,
  freeWriteNotepadWrap: true,
  freeWriteNotepadLineNumbers: true,
  freeWriteLastPdfId: null,
```

- [ ] **Step 2: Add clamp helper (same file or small util used by store later)**

```ts
// in src/lib/teaching/notepadPrefs.ts (create)
export function clampFreeWriteZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  return Math.min(200, Math.max(75, Math.round(zoom / 25) * 25));
}
```

Export from `src/lib/teaching/index.ts`. Optional tiny test: 74→75, 201→200, 113→100 (or 125 depending on round — pick `Math.round(zoom / 25) * 25`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/teaching
git commit -m "feat: add Free write notepad settings to profile defaults"
```

---

### Task 3: Session state + store actions

**Files:**
- Modify: `src/stores/appStore.ts`
- Modify: `src/lib/language/isLanguageLessonActive.ts` (+ tests) so spelling capture requires Spelling tab

**Interfaces:**
- Session state:
  - `languageSubjectTab: LanguageSubjectTab` (default `"spelling"`)
  - `freeWriteFocus: FreeWriteFocus` (default `"notepad"`)
  - `teachingPdfLibrary: TeachingPdfEntry[]` (loaded from Rust)
  - `freeWriteActivePdfId: string | null` (session; init from `settings.freeWriteLastPdfId`)
- Actions:
  - `setLanguageSubjectTab(tab)` — if leaving spelling while playing, call `stopLanguageLessonPlayback()`
  - `setFreeWriteFocus(focus)`
  - `freeWriteNotepadInput(textChunk)` / `freeWriteNotepadBackspace()` / `setFreeWriteNotepadText(text)`
  - `clearFreeWriteNotepad()` — empties text via `updateSettings`
  - `setFreeWriteNotepadZoom(zoom)` / `setFreeWriteNotepadWrap(wrap)` / `setFreeWriteNotepadLineNumbers(on)`
  - `loadTeachingPdfLibrary()` / `upsertTeachingPdf` / `removeTeachingPdf` / `openTeachingPdf(id)` / `pickTeachingPdf()`
- Update `isLanguageLessonActive` / capture helpers to also require `languageSubjectTab === "spelling"` (pass tab from store). Spelling Play must not capture while Free write is showing.

- [ ] **Step 1: Update language active helpers**

Extend `LanguageLessonModeInput` with `languageSubjectTab?: LanguageSubjectTab` (default treat missing as `"spelling"` for back-compat in tests).

```ts
import type { LanguageSubjectTab } from "../teaching";

// in isLanguageLessonActive:
export function isLanguageLessonActive(input: LanguageLessonModeInput): boolean {
  const tab = input.languageSubjectTab ?? "spelling";
  return (
    input.musicTeachingEnabled &&
    input.settings.keyboardSectionMode === "synthesizer" &&
    input.teachingLesson === "language" &&
    tab === "spelling"
  );
}
```

Update `isLanguageLessonActive.test.ts` accordingly (Free write tab → inactive).

- [ ] **Step 2: Add session fields + actions in appStore**

Wire `setLanguageSubjectTab`:

```ts
setLanguageSubjectTab: (tab) => {
  if (tab !== "spelling" && get().languageLessonPlaying) {
    get().stopLanguageLessonPlayback();
  }
  set({
    languageSubjectTab: tab,
    freeWriteFocus: tab === "freeWrite" ? "notepad" : get().freeWriteFocus,
  });
  void get().syncWindowFocusable();
},
```

Notepad text mutations persist through `updateSettings({ freeWriteNotepadText })`.

For PDF actions, invoke Rust commands from Task 4 (stub with TODO only if Task 4 not landed — **prefer implementing Task 4 before finishing store IPC**). If executing in parallel waves: Task 3 may add state + notepad actions first; PDF invoke wrappers land after Task 4.

- [ ] **Step 3: When `setTeachingLesson` leaves language, reset tab not required (keep session tab). When leaving Teaching entirely, optional reset — keep last Language tab for session as per spec.**

- [ ] **Step 4: Run** `npx vitest run src/lib/language/isLanguageLessonActive.test.ts src/lib/teaching/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/appStore.ts src/lib/language
git commit -m "feat: add Free write session state and gate spelling to Spelling tab"
```

---

### Task 4: Rust PDF pick / read / library commands

**Files:**
- Create: `src-tauri/src/teaching_pdf.rs`
- Modify: `src-tauri/src/lib.rs` (`mod teaching_pdf;` + register commands)
- Optional Rust unit tests for cap logic if pure; prefer TS helpers for cap — Rust stores array as frontend sends upserted list OR Rust implements upsert. **Decision: Rust stores full array written by frontend after each change** (simpler, mirrors language packs) — commands:
  - `cmd_list_teaching_pdfs` → `Value` array
  - `cmd_save_teaching_pdfs` → replace file with array
  - `cmd_pick_teaching_pdf` → `Option<String>` path; allowlist path
  - `cmd_read_teaching_pdf` → `{ path, contentBase64 }` with allowlist + `.pdf` + max size **32 MiB**

Mirror `music.rs` allowlist + `rfd` filter `PDF` `["pdf"]`. Library path: `app_data_dir/teaching/pdf-library.json`.

- [ ] **Step 1: Implement `teaching_pdf.rs`** (copy structure from `music.rs`: allow paths on pick, read with extension/size checks, list/save JSON array)

- [ ] **Step 2: Register in `lib.rs` invoke handler**

- [ ] **Step 3: Run** `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (existing + any new)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/teaching_pdf.rs src-tauri/src/lib.rs
git commit -m "feat: add teaching PDF pick/read and library Tauri commands"
```

---

### Task 5: `TeachingSubjectTabs` + Language shell wiring

**Files:**
- Create: `src/components/teaching/TeachingSubjectTabs.tsx`
- Create: `src/components/teaching/TeachingSubjectShell.tsx`
- Modify: `src/components/layout/AppShell.tsx` — Language branch wraps shell
- Modify: `src/i18n/en.ts` (+ all locales): `teachingTabSpelling`, `teachingTabFreeWrite`

**Interfaces:**
- Consumes: `languageSubjectTab`, `setLanguageSubjectTab` from store
- Produces UI:

```tsx
// TeachingSubjectTabs
export function TeachingSubjectTabs<T extends string>({
  tabs,
  activeId,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  activeId: T;
  onChange: (id: T) => void;
}): JSX.Element | null
// return null if tabs.length <= 1
```

```tsx
// TeachingSubjectShell
export function TeachingSubjectShell({
  tabs,
  activeId,
  onChange,
  children,
}: { ... }): JSX.Element
```

Language in AppShell:

```tsx
case "language":
  return (
    <TeachingSubjectShell
      tabs={[
        { id: "spelling", label: t("teachingTabSpelling") },
        { id: "freeWrite", label: t("teachingTabFreeWrite") },
      ]}
      activeId={languageSubjectTab}
      onChange={setLanguageSubjectTab}
    >
      {languageSubjectTab === "freeWrite" ? <FreeWritePanel /> : <LanguageLessonPanel />}
    </TeachingSubjectShell>
  );
```

(`FreeWritePanel` may be a stub component until Task 6 — export empty panel with "Free write" text so the shell compiles.)

Visual: touch-friendly tabs (`h-10`+), active tab uses stronger border/bg from section surface colors (reuse header/panel tokens via props or `useAppStore` settings colors). Do **not** put tabs in the draggable header row.

- [ ] **Step 1: Add i18n keys** (EN + mirrors)

```ts
teachingTabSpelling: "Spelling",
teachingTabFreeWrite: "Free write",
```

- [ ] **Step 2: Implement tabs + shell; wire AppShell; stub FreeWritePanel if needed**

- [ ] **Step 3: `npx tsc --noEmit`**
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/teaching/TeachingSubjectTabs.tsx src/components/teaching/TeachingSubjectShell.tsx src/components/layout/AppShell.tsx src/i18n src/components/teaching/FreeWritePanel.tsx
git commit -m "feat: add Language Spelling/Free write subject tabs"
```

---

### Task 6: Free write notepad editor

**Files:**
- Create: `src/components/teaching/FreeWriteNotepad.tsx`
- Modify: `src/components/teaching/FreeWritePanel.tsx` (left pane)
- Modify: `src/i18n/*.ts` — notepad keys from spec §9

**Behavior:**
- Toolbar: Zoom − / +, wrap toggle, line numbers toggle, Clear all (confirm via `window.confirm(t("freeWriteClearConfirm"))` or existing confirm pattern if any)
- Body: textarea or contentEditable-free plain `<textarea>` with:
  - `fontSize: ${zoom}%` relative to a base (e.g. 16px * zoom/100)
  - `whiteSpace` / `overflowWrap` from wrap
  - optional line-number gutter synced to scroll (`onScroll` copy `scrollTop`)
- Focus → `setFreeWriteFocus("notepad")`
- Persist text on change (debounce 300ms OK) via `updateSettings`

Keys:

```ts
freeWriteNotepad: "Notepad",
freeWriteClearAll: "Clear all",
freeWriteClearConfirm: "Clear the entire notepad draft?",
freeWriteZoomIn: "Zoom in",
freeWriteZoomOut: "Zoom out",
freeWriteWordWrap: "Word wrap",
freeWriteLineNumbers: "Line numbers",
freeWriteNotepadEmpty: "Type notes here…",
```

- [ ] **Step 1: Implement FreeWriteNotepad + wire left side of FreeWritePanel using TeachingLessonPanel**

- [ ] **Step 2: Manual sanity — zoom/wrap/line numbers persist after profile round-trip (settings already persist)**

- [ ] **Step 3: Commit**

```bash
git add src/components/teaching/FreeWriteNotepad.tsx src/components/teaching/FreeWritePanel.tsx src/i18n
git commit -m "feat: add Free write notepad with zoom, wrap, and line numbers"
```

---

### Task 7: PDF pane + pdf.js viewer

**Files:**
- Modify: `package.json` / lockfile — add `pdfjs-dist`
- Create: `src/components/teaching/FreeWritePdfPane.tsx`
- Modify: `src/components/teaching/FreeWritePanel.tsx` (right pane)
- Possibly: `src-tauri/tauri.conf.json` CSP add `worker-src 'self' blob:`
- Modify: `src/i18n/*.ts`

**Approach:**
1. `npm install pdfjs-dist`
2. On Open: `invoke("cmd_pick_teaching_pdf")` → upsert library entry (`id` = stable hash or `crypto.randomUUID()`, title = file name) → `cmd_save_teaching_pdfs` → `cmd_read_teaching_pdf` → `pdfjs.getDocument({ data: Uint8Array })`
3. Render page canvas(es) with page prev/next + zoom controls (viewer-local zoom OK; not profile-persisted)
4. Recent list from `teachingPdfLibrary`; missing file → show `freeWritePdfMissing` + Remove / Open again
5. Clicking PDF chrome → `setFreeWriteFocus("pdf")` (notepad capture off; no external injection)
6. On mount Free write: `loadTeachingPdfLibrary()` then reopen `freeWriteLastPdfId` if present

Worker setup (Vite):

```ts
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
```

If CSP blocks worker, add `worker-src 'self' blob:` to `tauri.conf.json` CSP string.

Keys:

```ts
freeWriteOpenPdf: "Open PDF…",
freeWriteRecentPdfs: "Recent PDFs",
freeWritePdfMissing: "This PDF file could not be found.",
freeWritePdfEmpty: "Open a PDF to read beside your notes.",
freeWritePdfPrevPage: "Previous page",
freeWritePdfNextPage: "Next page",
freeWriteRemovePdf: "Remove",
```

- [ ] **Step 1: Install pdfjs-dist**

- [ ] **Step 2: Implement FreeWritePdfPane + complete FreeWritePanel split (`freeWriteLeftRatio`)**

- [ ] **Step 3: `npx tsc --noEmit` + `npm test`**

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/teaching src/i18n src-tauri/tauri.conf.json
git commit -m "feat: add Free write PDF library pane with pdf.js viewer"
```

---

### Task 8: Keyboard + physical capture for Free write

**Files:**
- Modify: `src/components/keyboard/Keyboard.tsx`
- Modify: `src/hooks/useLanguageLessonPhysicalKeyboard.ts` (or create `useFreeWritePhysicalKeyboard.ts` and call both from AppShell)
- Ensure Greek compose uses typing language (not lesson language) for Free write

**Behavior when `isFreeWriteCaptureActive`:**
- Printable → append to `freeWriteNotepadText`
- Backspace → remove last code point
- Enter → insert `\n`
- Space → insert ` `
- Do **not** call `cmd_press_key` / normal injection
- When `freeWriteFocus === "pdf"`, do **not** capture into notepad and do **not** inject externally (swallow or no-op for OSK; physical keys may reach PDF.js field if webview focus is inside an AcroForm — acceptable)

Update `syncWindowFocusable` consumers so Free write notepad capture keeps window focusable like language lesson.

- [ ] **Step 1: Wire Keyboard.tsx branch before normal injection (after language spelling branch)**

- [ ] **Step 2: Physical keyboard hook for Free write (mirror language hook, simpler buffer)**

- [ ] **Step 3: Unit-test predicates already cover gate; smoke manually**

- [ ] **Step 4: Commit**

```bash
git add src/components/keyboard/Keyboard.tsx src/hooks src/stores/appStore.ts
git commit -m "feat: route on-screen and physical keys into Free write notepad"
```

---

### Task 9: README + final i18n sweep + smoke checklist

**Files:**
- Modify: `README.md` Teaching bullet
- Verify all locales have every new key

README change (Teaching bullet): extend Language sentence to mention Free write notepad + PDF library.

- [ ] **Step 1: Update README**

- [ ] **Step 2: Grep i18n for missing keys vs `en.ts`**

- [ ] **Step 3: Run full gate**

```bash
npx tsc --noEmit
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 4: Commit**

```bash
git add README.md src/i18n
git commit -m "docs: mention Language Free write in README"
```

**Manual smoke (record in SDD ledger):**
- [ ] Spelling ↔ Free write tabs
- [ ] Open PDF, reopen from recent, missing path Remove
- [ ] Clear all confirm
- [ ] Keyboard into notepad; switch to Music without stuck capture
- [ ] Play stops when leaving Spelling
- [ ] Split resize persists

---

## Self-review (plan vs spec)

| Spec section | Task |
| --- | --- |
| §6 Subject tabs shell | Task 5 |
| §7.1 Split layout | Tasks 6–7 |
| §7.2 Notepad zoom/wrap/line numbers/clear | Task 6 + 2 |
| §7.3 PDF library | Tasks 1, 4, 7 |
| §7.4 PDF viewer | Task 7 |
| §7.5 Focus model | Tasks 3, 8 |
| §8 Stop Play on leave Spelling | Task 3 |
| §9 i18n | Tasks 5–7, 9 |
| §10 README | Task 9 |
| §11 Tests | Tasks 1, 3 |

Open points resolved in this plan: pdf.js via `pdfjs-dist`; library global JSON + per-profile notepad/last id; stop Play on tab leave.

---

## Execution notes (controller)

- **SDD model policy:** `composer-2.5-fast` for Tasks 1–2, 5 (mechanical); `cursor-grok-4.5-high` for Tasks 3–4, 6–8; final review `cursor-grok-4.6-high`.
- **Parallel waves (disjoint files):** Wave A: Task 1 || Task 2; then Task 4 || (Task 3 notepad-only if split); after Task 4+3: Task 5; then Task 6 || start Task 7 install; Task 8 after 6; Task 9 last.
- Continue on branch `feature/language-lesson-phase1`.
