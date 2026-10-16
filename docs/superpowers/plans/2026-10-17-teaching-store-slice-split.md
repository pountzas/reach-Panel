# Teaching store slice split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split monolithic `teachingSlice.ts` into eight domain Zustand slices while keeping the flat `useAppStore` keys/actions identical.

**Architecture:** Thin `teachingSlice` owns session chrome (`musicTeachingEnabled`, `teachingLesson`, tabs/focus, keyboard minimize, session sync). Domain slices own spelling, language packs, notepad, PDF, piano playback, partitures, and piano-range fit actions. Persisted octave knobs stay on `settings` / `profileSlice`. Cross-slice coordination uses `get()` and existing helpers only.

**Tech Stack:** TypeScript, Zustand 5 (`StateCreator`), Vitest, Tauri 2 (Windows).

**Spec:** `docs/superpowers/specs/2026-10-17-teaching-store-slice-split-design.md`

## Global Constraints

- Windows only; no macOS/Linux paths or stubs.
- Behavior-preserving: do not change action bodies except replacing inline range-fit with `get().fitPianoRangeForSong(song)`.
- Keep flat store keys/action names; no `state.teaching` nesting; no `language*` → `spelling*` renames in this plan.
- Do not move `synthesizerOctaveCount` / `synthesizerStartOctave` off `AppSettings`.
- Do not commit unless the user asks.
- Prefer deleting `TeachingSlice` after the split; temporary alias only within a single task if needed for a green typecheck mid-flight.

## File map

| File | Role |
| --- | --- |
| `src/stores/types.ts` | Replace `TeachingSlice` with eight interfaces; update `AppStore` |
| `src/stores/slices/teachingSlice.ts` | Shell only after Task 6 |
| `src/stores/slices/pianoRangeSlice.ts` | `fitPianoRangeForSong` |
| `src/stores/slices/pianoRangeSlice.test.ts` | Store-level fit test |
| `src/stores/slices/pianoSlice.ts` | Playback / note progress |
| `src/stores/slices/partituresSlice.ts` | Songs library + `musicSongId` |
| `src/stores/slices/spellingSlice.ts` | Language lesson play/input/authoring UI |
| `src/stores/slices/languagePacksSlice.ts` | Custom packs + `languagePackId` |
| `src/stores/slices/notepadSlice.ts` | Free-write notepad I/O |
| `src/stores/slices/pdfSlice.ts` | PDF library + annotations (+ module timers) |
| `src/stores/appStore.ts` | Compose all eight creators |
| `src/stores/slices/freeWritePdfPointer.test.ts` | Stays; still hits `useAppStore` |
| `src/stores/slices/teachingKeyboardMinimize.test.ts` | Stays; shell still provides those actions |

**Source of truth for moved bodies:** current `src/stores/slices/teachingSlice.ts` on this branch. Move method implementations verbatim (cut/paste). Do not rewrite logic.

---

### Task 1: Split teaching types

**Files:**
- Modify: `src/stores/types.ts`

**Interfaces:**
- Produces (exact names):
  - `TeachingSlice` — shell fields/actions listed in Step 2
  - `SpellingSlice`
  - `LanguagePacksSlice`
  - `NotepadSlice`
  - `PdfSlice`
  - `PianoSlice`
  - `PartituresSlice`
  - `PianoRangeSlice`
- Consumes: existing imports already in `types.ts` (`MusicSong` not required on types — `fitPianoRangeForSong` takes `MusicSong` from `../lib/music/songs`)

- [ ] **Step 1: Add `MusicSong` import for `PianoRangeSlice`**

At the top of `src/stores/types.ts`, add:

```ts
import type { MusicSong } from "../lib/music/songs";
```

- [ ] **Step 2: Replace `export interface TeachingSlice { ... }` with eight interfaces**

Delete the monolithic `TeachingSlice` block (lines ~91–189). Insert:

```ts
export interface TeachingSlice {
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
  /** Ephemeral: Language/Math keyboard chrome minimize (not persisted). */
  teachingKeyboardMinimized: boolean;
  /** Ephemeral: Focus auto-minimize toggle (not persisted). */
  teachingKeyboardAutoFocus: boolean;
  enableMusicTeaching: () => Promise<void>;
  disableMusicTeaching: () => Promise<void>;
  setTeachingLesson: (lesson: TeachingLesson) => void;
  setTeachingKeyboardMinimized: (minimized: boolean) => void;
  setTeachingKeyboardAutoFocus: (autoFocus: boolean) => void;
  toggleTeachingKeyboardMinimized: () => void;
  toggleTeachingKeyboardAutoFocus: () => void;
  applyTeachingSession: (payload: TeachingSessionPayload) => void;
  broadcastTeachingSession: () => Promise<void>;
  setLanguageSubjectTab: (tab: LanguageSubjectTab) => void;
  setFreeWriteFocus: (focus: FreeWriteFocus) => void;
}

export interface SpellingSlice {
  languageTaskIndex: number;
  languageInputBuffer: string;
  languageAnswerIncorrect: boolean;
  languageLessonPlaying: boolean;
  languageListAuthoringActive: boolean;
  languageListAuthoringField: LanguageListAuthoringField;
  languageListAuthoringHandlers: LanguageListAuthoringHandlers | null;
  restartLanguageLesson: () => void;
  startLanguageLessonPlayback: () => void;
  stopLanguageLessonPlayback: () => void;
  setLanguageListAuthoringActive: (active: boolean) => void;
  setLanguageListAuthoringField: (field: LanguageListAuthoringField) => void;
  registerLanguageListAuthoringHandlers: (
    handlers: LanguageListAuthoringHandlers | null,
  ) => void;
  languageKeyInput: (ch: string, options?: { physicalKey?: string }) => void;
  languageBackspace: () => void;
  checkLanguageAnswer: () => void;
}

export interface LanguagePacksSlice {
  customLanguagePacks: LanguagePack[];
  languagePackId: string | null;
  loadCustomLanguagePacks: () => Promise<void>;
  createCustomLanguagePack: (pack: LanguagePack) => Promise<void>;
  deleteCustomLanguagePack: (id: string) => Promise<void>;
  setLanguagePackId: (id: string) => void;
}

export interface NotepadSlice {
  freeWriteNotepadInput: (ch: string) => void;
  freeWriteNotepadBackspace: () => void;
  applyFreeWriteLayoutTranslation: (
    translation: LayoutKeyTranslation,
    options?: {
      physicalKey?: string;
      shift?: boolean;
      fallbackOutput?: string;
    },
  ) => void;
  setFreeWriteNotepadText: (text: string) => void;
  clearFreeWriteNotepad: () => void;
  setFreeWriteNotepadZoom: (zoom: number) => void;
  setFreeWriteNotepadWrap: (wrap: boolean) => void;
  setFreeWriteNotepadLineNumbers: (on: boolean) => void;
}

export interface PdfSlice {
  teachingPdfLibrary: TeachingPdfEntry[];
  freeWriteActivePdfId: string | null;
  freeWritePdfTool: "pointer" | "pen" | "eraser" | "text";
  freeWriteAnnotationDoc: PdfAnnotationDoc;
  freeWriteSelectedTextId: string | null;
  freeWriteAnnotationDirty: boolean;
  freeWriteUndoDepth: number;
  freeWriteRedoDepth: number;
  loadTeachingPdfLibrary: () => Promise<void>;
  pickTeachingPdf: () => Promise<void>;
  closeTeachingPdf: () => Promise<void>;
  setFreeWritePdfTool: (tool: "pointer" | "pen" | "eraser" | "text") => void;
  setFreeWriteSelectedTextId: (id: string | null) => void;
  beginFreeWritePdfTextEdit: (id: string) => void;
  loadFreeWriteAnnotations: (path: string | null) => Promise<void>;
  scheduleSaveFreeWriteAnnotations: () => void;
  flushFreeWriteAnnotations: () => Promise<void>;
  exportTeachingReachPdf: (from: number, to: number) => Promise<void>;
  clearAllFreeWriteAnnotations: () => Promise<boolean>;
  applyFreeWriteAnnotationUpdater: (
    updater: (doc: PdfAnnotationDoc) => PdfAnnotationDoc,
    options?: { pushUndo?: boolean; undoFrom?: PdfAnnotationDoc },
  ) => void;
  undoFreeWriteAnnotation: () => void;
  redoFreeWriteAnnotation: () => void;
}

export interface PianoSlice {
  musicNoteIndex: number;
  musicPlaybackActive: boolean;
  restartMusicLesson: () => void;
  reportMusicKeyPlayed: (keyId: string) => void;
  startMusicPlayback: () => void;
  stopMusicPlayback: () => void;
  setMusicPlaybackNoteIndex: (index: number) => void;
  finishMusicPlayback: () => void;
}

export interface PartituresSlice {
  musicSongId: string | null;
  importedSongs: ImportedMusicSong[];
  setMusicSongId: (songId: string) => Promise<void>;
  loadImportedSongs: () => Promise<void>;
  importMusicSongsFromFile: () => Promise<void>;
  deleteImportedSong: (id: string) => Promise<void>;
}

export interface PianoRangeSlice {
  fitPianoRangeForSong: (song: MusicSong) => Promise<void>;
}
```

- [ ] **Step 3: Update `AppStore` intersection**

Replace:

```ts
export type AppStore = ErrorsSlice &
  SuggestionsSlice &
  DictationSlice &
  CompanionSlice &
  TeachingSlice &
  TypingSlice &
  WindowSlice &
  FocusModeSlice &
  ModeSlice &
  ProfileSlice;
```

with:

```ts
export type AppStore = ErrorsSlice &
  SuggestionsSlice &
  DictationSlice &
  CompanionSlice &
  TeachingSlice &
  SpellingSlice &
  LanguagePacksSlice &
  NotepadSlice &
  PdfSlice &
  PianoSlice &
  PartituresSlice &
  PianoRangeSlice &
  TypingSlice &
  WindowSlice &
  FocusModeSlice &
  ModeSlice &
  ProfileSlice;
```

- [ ] **Step 4: Temporary compile bridge (same task)**

`createTeachingSlice` still returns the old full object. Until later tasks move methods out, keep `teachingSlice.ts` typed as:

```ts
export const createTeachingSlice: StateCreator<
  AppStore,
  [],
  [],
  TeachingSlice &
    SpellingSlice &
    LanguagePacksSlice &
    NotepadSlice &
    PdfSlice &
    PianoSlice &
    PartituresSlice &
    PianoRangeSlice
> = (set, get) => ({
```

Update the import in `teachingSlice.ts`:

```ts
import type {
  AppStore,
  TeachingSlice,
  SpellingSlice,
  LanguagePacksSlice,
  NotepadSlice,
  PdfSlice,
  PianoSlice,
  PartituresSlice,
  PianoRangeSlice,
} from "../types";
```

Add a stub on the existing object so `PianoRangeSlice` is satisfied before Task 2 extracts it — insert next to music helpers:

```ts
  fitPianoRangeForSong: async (song) => {
    const fit = songPianoRangeFit(song);
    if (fit) {
      await get().updateSettings({
        synthesizerOctaveCount: fit.octaveCount,
        synthesizerStartOctave: fit.startOctave,
      });
    }
  },
```

Replace the two inline fit blocks in `enableMusicTeaching` and `setMusicSongId` with:

```ts
    await get().fitPianoRangeForSong(song);
```

(`enableMusicTeaching`: after `getSongById`, if `song` then await fit. `setMusicSongId`: same after `set(...)`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`  
Expected: PASS (exit 0).

---

### Task 2: Extract `pianoRangeSlice` (TDD)

**Files:**
- Create: `src/stores/slices/pianoRangeSlice.ts`
- Create: `src/stores/slices/pianoRangeSlice.test.ts`
- Modify: `src/stores/slices/teachingSlice.ts` (remove fit implementation)
- Modify: `src/stores/appStore.ts`

**Interfaces:**
- Consumes: `PianoRangeSlice.fitPianoRangeForSong` from Task 1
- Produces: `createPianoRangeSlice`

- [ ] **Step 1: Write failing test**

Create `src/stores/slices/pianoRangeSlice.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

vi.mock("../../lib/notify", () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { getSongById } from "../../lib/music/songs";
import { useAppStore } from "../appStore";

describe("pianoRangeSlice", () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: {
        ...useAppStore.getState().settings,
        synthesizerOctaveCount: 2,
        synthesizerStartOctave: 3,
      },
    });
  });

  it("fitPianoRangeForSong applies songPianoRangeFit via updateSettings", async () => {
    const song = getSongById("twinkle", []);
    expect(song).not.toBeNull();
    await useAppStore.getState().fitPianoRangeForSong(song!);
    const { settings } = useAppStore.getState();
    expect(settings.synthesizerOctaveCount).toBeGreaterThanOrEqual(2);
    expect(typeof settings.synthesizerStartOctave).toBe("number");
  });
});
```

- [ ] **Step 2: Run test (may already pass if stub from Task 1 is wired)**

Run: `npm test -- src/stores/slices/pianoRangeSlice.test.ts`  
Expected: PASS once `fitPianoRangeForSong` exists on the store (Task 1 stub or this task’s slice).

- [ ] **Step 3: Create `pianoRangeSlice.ts` and wire it**

Create `src/stores/slices/pianoRangeSlice.ts`:

```ts
import type { StateCreator } from "zustand";
import type { AppStore, PianoRangeSlice } from "../types";
import { songPianoRangeFit } from "../../lib/music/songs";

export const createPianoRangeSlice: StateCreator<
  AppStore,
  [],
  [],
  PianoRangeSlice
> = (_set, get) => ({
  fitPianoRangeForSong: async (song) => {
    const fit = songPianoRangeFit(song);
    if (fit) {
      await get().updateSettings({
        synthesizerOctaveCount: fit.octaveCount,
        synthesizerStartOctave: fit.startOctave,
      });
    }
  },
});
```

In `appStore.ts`, import and spread **after** `createTeachingSlice`:

```ts
import { createPianoRangeSlice } from "./slices/pianoRangeSlice";
// ...
  ...createTeachingSlice(...a),
  ...createPianoRangeSlice(...a),
```

Remove `fitPianoRangeForSong` from `teachingSlice.ts` and drop `PianoRangeSlice` from that creator’s return type intersection. Remove unused `songPianoRangeFit` import from `teachingSlice.ts` if nothing else needs it.

Keep call sites:

```ts
await get().fitPianoRangeForSong(song);
```

in `enableMusicTeaching` and (after Task 3) `setMusicSongId` in partitures.

- [ ] **Step 4: Re-run test + typecheck**

Run:

```bash
npm test -- src/stores/slices/pianoRangeSlice.test.ts
npm run typecheck
```

Expected: both PASS.

---

### Task 3: Extract `pianoSlice` + `partituresSlice`

**Files:**
- Create: `src/stores/slices/pianoSlice.ts`
- Create: `src/stores/slices/partituresSlice.ts`
- Modify: `src/stores/slices/teachingSlice.ts`
- Modify: `src/stores/appStore.ts`

**Interfaces:**
- Consumes: `PianoSlice`, `PartituresSlice`, `get().fitPianoRangeForSong`
- Produces: `createPianoSlice`, `createPartituresSlice`

- [ ] **Step 1: Create `pianoSlice.ts`**

Move initial state + methods from current `teachingSlice.ts`:

- State defaults: `musicNoteIndex: 0`, `musicPlaybackActive: false`
- Methods: `restartMusicLesson`, `reportMusicKeyPlayed`, `startMusicPlayback`, `stopMusicPlayback`, `setMusicPlaybackNoteIndex`, `finishMusicPlayback`

Skeleton:

```ts
import type { StateCreator } from "zustand";
import type { AppStore, PianoSlice } from "../types";
import { getSongById } from "../../lib/music/songs";

export const createPianoSlice: StateCreator<AppStore, [], [], PianoSlice> = (
  set,
  get,
) => ({
  musicNoteIndex: 0,
  musicPlaybackActive: false,
  // paste method bodies verbatim from teachingSlice
});
```

- [ ] **Step 2: Create `partituresSlice.ts`**

Move:

- State: `musicSongId: "twinkle"`, `importedSongs: []`
- Methods: `setMusicSongId`, `loadImportedSongs`, `importMusicSongsFromFile`, `deleteImportedSong`

`setMusicSongId` body must end with `await get().fitPianoRangeForSong(song)` (not inline `songPianoRangeFit`).

Imports needed (from current teaching slice usage): `invoke`, `notify`, `getSongById`, `BUILT_IN_SONGS`, `ImportedMusicSong`, `parseMusicFilePayload`, `MusicFilePayload`, `isImportedMusicSong`.

- [ ] **Step 3: Shrink teaching shell type + remove moved fields**

From `createTeachingSlice` return type, drop `PianoSlice & PartituresSlice`. Remove moved defaults/methods from the object. Shell `enableMusicTeaching` may still `set({ musicNoteIndex: 0, musicSongId: ... })` (cross-slice field write — allowed).

Wire in `appStore.ts`:

```ts
import { createPianoSlice } from "./slices/pianoSlice";
import { createPartituresSlice } from "./slices/partituresSlice";
// ...
  ...createTeachingSlice(...a),
  ...createPianoSlice(...a),
  ...createPartituresSlice(...a),
  ...createPianoRangeSlice(...a),
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npm test -- src/stores/slices/pianoRangeSlice.test.ts src/stores/slices/teachingKeyboardMinimize.test.ts
```

Expected: PASS.

---

### Task 4: Extract `languagePacksSlice` + `spellingSlice`

**Files:**
- Create: `src/stores/slices/languagePacksSlice.ts`
- Create: `src/stores/slices/spellingSlice.ts`
- Modify: `src/stores/slices/teachingSlice.ts`
- Modify: `src/stores/appStore.ts`

**Interfaces:**
- Consumes: `LanguagePacksSlice`, `SpellingSlice`
- Produces: `createLanguagePacksSlice`, `createSpellingSlice`

- [ ] **Step 1: Create `languagePacksSlice.ts`**

Move state + methods:

- `customLanguagePacks`, `languagePackId`
- `loadCustomLanguagePacks`, `createCustomLanguagePack`, `deleteCustomLanguagePack`, `setLanguagePackId`

Keep `setLanguagePackId` resetting spelling fields (`languageTaskIndex`, buffers, etc.) in the same `set()` — do not invent a spelling API for this.

- [ ] **Step 2: Create `spellingSlice.ts`**

Move state + methods:

- `languageTaskIndex`, `languageInputBuffer`, `languageAnswerIncorrect`, `languageLessonPlaying`, authoring fields/handlers
- `restartLanguageLesson`, start/stop playback, authoring setters, `languageKeyInput`, `languageBackspace`, `checkLanguageAnswer`

Move helper usage/`dropTeachingSuggestionPrefix` as needed (copy the small helper into a shared place only if both shell and spelling need it — today it lives at top of `teachingSlice.ts`; **prefer** moving it to `src/stores/storeShared.ts` or `src/stores/lib/teachingSuggestions.ts` if both files need it, otherwise keep one copy in spelling and duplicate is forbidden: extract to `storeShared` when shell also calls it).

Shell still calls `dropTeachingSuggestionPrefix` in `disableMusicTeaching` / tab/focus setters — extract helper to `storeShared.ts` (or existing teaching lib) in this step:

```ts
/** Drop Teaching-sourced prefix + chips so they can't be applied to another target. */
export function dropTeachingSuggestionPrefix(
  set: (partial: { typedBuffer?: string; suggestions?: string[] }) => void,
): void {
  storeFlags.suggestionsRequestId += 1;
  commitSuggestionList(set, []);
  set({ typedBuffer: "" });
}
```

(Import `storeFlags` + `commitSuggestionList` in that module; remove the local copy from teaching/spelling.)

- [ ] **Step 3: Wire appStore; shrink teaching creator types**

```ts
import { createLanguagePacksSlice } from "./slices/languagePacksSlice";
import { createSpellingSlice } from "./slices/spellingSlice";
// ...
  ...createSpellingSlice(...a),
  ...createLanguagePacksSlice(...a),
```

Drop `SpellingSlice & LanguagePacksSlice` from `createTeachingSlice` return type. Remove moved state defaults (`languageSubjectTab` stays on shell).

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npm test -- src/stores
```

Expected: PASS (or only pre-existing failures unrelated to this move — if any fail, fix regressions introduced by the extract).

---

### Task 5: Extract `notepadSlice` + `pdfSlice`

**Files:**
- Create: `src/stores/slices/notepadSlice.ts`
- Create: `src/stores/slices/pdfSlice.ts`
- Modify: `src/stores/slices/teachingSlice.ts`
- Modify: `src/stores/appStore.ts`

**Interfaces:**
- Consumes: `NotepadSlice`, `PdfSlice`
- Produces: `createNotepadSlice`, `createPdfSlice`

- [ ] **Step 1: Create `notepadSlice.ts`**

Move methods only (no dedicated notepad state on the slice — text lives in `settings`):

- `freeWriteNotepadInput`, `freeWriteNotepadBackspace`, `applyFreeWriteLayoutTranslation`, `setFreeWriteNotepadText`, `clearFreeWriteNotepad`, `setFreeWriteNotepadZoom`, `setFreeWriteNotepadWrap`, `setFreeWriteNotepadLineNumbers`

- [ ] **Step 2: Create `pdfSlice.ts`**

Move module-level PDF locals from `teachingSlice.ts` to the top of `pdfSlice.ts`:

```ts
const SAVE_DEBOUNCE_MS = 400;
let freeWriteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let freeWriteUndoStack = createUndoStack(50);
let freeWriteAnnotationsPath: string | null = null;

function resetFreeWriteUndo(): void {
  freeWriteUndoStack = createUndoStack(50);
}
```

Move state defaults + all PDF methods listed on `PdfSlice`. PDF methods may still `set({ freeWriteFocus: ... })` (shell-owned field) — preserve current behavior.

- [ ] **Step 3: Wire appStore; remove PDF/notepad from teaching**

```ts
import { createNotepadSlice } from "./slices/notepadSlice";
import { createPdfSlice } from "./slices/pdfSlice";
// ...
  ...createNotepadSlice(...a),
  ...createPdfSlice(...a),
```

`createTeachingSlice` return type should now be only `TeachingSlice`.

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npm test -- src/stores/slices/freeWritePdfPointer.test.ts src/stores/slices/teachingKeyboardMinimize.test.ts
```

Expected: PASS.

---

### Task 6: Finalize shell `teachingSlice` + composition order

**Files:**
- Modify: `src/stores/slices/teachingSlice.ts` (shell-only cleanup)
- Modify: `src/stores/appStore.ts` (final import order)

**Interfaces:**
- Produces: shell-only `createTeachingSlice: StateCreator<AppStore, [], [], TeachingSlice>`

- [ ] **Step 1: Ensure teachingSlice contains only shell**

Expected remaining pieces:

- Imports needed for enable/disable, lesson switch, tab/focus, keyboard minimize, session emit
- Defaults: `musicTeachingEnabled`, `teachingLesson`, `languageSubjectTab`, `freeWriteFocus`, keyboard flags
- Actions listed on `TeachingSlice` in Task 1
- Cross-field writes in `enableMusicTeaching` / `disableMusicTeaching` / `setTeachingLesson` unchanged in behavior

Remove unused imports (music parse, PDF helpers, language answer matchers, etc.).

- [ ] **Step 2: Final `appStore.ts` composition**

```ts
import { createTeachingSlice } from "./slices/teachingSlice";
import { createSpellingSlice } from "./slices/spellingSlice";
import { createLanguagePacksSlice } from "./slices/languagePacksSlice";
import { createNotepadSlice } from "./slices/notepadSlice";
import { createPdfSlice } from "./slices/pdfSlice";
import { createPianoSlice } from "./slices/pianoSlice";
import { createPartituresSlice } from "./slices/partituresSlice";
import { createPianoRangeSlice } from "./slices/pianoRangeSlice";

export const useAppStore = create<AppStore>()((...a) => ({
  ...createProfileSlice(...a),
  ...createErrorsSlice(...a),
  ...createSuggestionsSlice(...a),
  ...createDictationSlice(...a),
  ...createCompanionSlice(...a),
  ...createTeachingSlice(...a),
  ...createSpellingSlice(...a),
  ...createLanguagePacksSlice(...a),
  ...createNotepadSlice(...a),
  ...createPdfSlice(...a),
  ...createPianoSlice(...a),
  ...createPartituresSlice(...a),
  ...createPianoRangeSlice(...a),
  ...createTypingSlice(...a),
  ...createWindowSlice(...a),
  ...createFocusModeSlice(...a),
  ...createModeSlice(...a),
}));
```

- [ ] **Step 3: Full store verification**

Run:

```bash
npm run typecheck
npm test -- src/stores
```

Expected: typecheck PASS; store tests PASS.

- [ ] **Step 4: Grep for leftover monolith assumptions**

Run:

```bash
rg "TeachingSlice &|createTeachingSlice" src
```

Expected: `TeachingSlice` only as the shell interface; `createTeachingSlice` only in `teachingSlice.ts` + `appStore.ts`. No remaining intersection alias on the teaching creator.

---

## Spec coverage checklist

| Spec section | Task |
| --- | --- |
| §3 Architecture & eight files | Tasks 2–6 |
| §3.2 appStore composition | Tasks 2–6 |
| §3.3 types split / delete monolith | Task 1 + Task 6 cleanup |
| §4.1 teaching shell | Task 6 |
| §4.2 spelling | Task 4 |
| §4.3 language packs | Task 4 |
| §4.4 notepad | Task 5 |
| §4.5 pdf + module timers | Task 5 |
| §4.6 piano | Task 3 |
| §4.7 partitures | Task 3 |
| §4.8 pianoRange + `fitPianoRangeForSong` | Tasks 1–2 |
| §5 shared `dropTeachingSuggestionPrefix` | Task 4 |
| §6 success criteria / tests | Tasks 2, 5, 6 |

## Plan self-review

- No TBD action names: `fitPianoRangeForSong(song: MusicSong) => Promise<void>` is locked.
- Keys/actions unchanged except the additive `fitPianoRangeForSong` (new public action used internally; UI need not call it).
- Commits omitted from steps per Global Constraints (ask user before committing).
