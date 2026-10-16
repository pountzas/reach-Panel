# Teaching store slice split — Design Spec

**Date:** 2026-10-17  
**Status:** Approved for implementation  
**Scope:** Refactor `src/stores/slices/teachingSlice.ts` into domain Zustand slices. Behavior-preserving; Windows app only.  
**Non-goals:** Nested `state.teaching` namespaces; moving `synthesizerOctaveCount` / `synthesizerStartOctave` off `AppSettings`; wholesale key renames (`language*` → `spelling*`); UI redesign.

## 1. Goals

- Split mixed teaching responsibilities by product domain, not by line count alone.
- Keep a thin teaching shell for session chrome shared across domains.
- Preserve the flat `useAppStore` surface (same keys and action names) so components do not need an API migration.
- Keep persisted piano range knobs in profile settings; teaching owns fit/actions only.

## 2. Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| Overall approach | Domain slices + thin teaching shell (Approach 1) |
| Public API | Flat keys; mechanical extract first; rename only where names are wrong (none required in this pass) |
| Language | Split into `spellingSlice` + `languagePacksSlice` |
| Music | Three slices: `pianoSlice`, `partituresSlice`, `pianoRangeSlice` |
| Free write | `notepadSlice` + `pdfSlice` |
| `freeWriteFocus` | Owned by teaching shell (with `languageSubjectTab`) |
| Octaves / ranges | Actions in `pianoRangeSlice`; values stay on `settings` via `updateSettings` / `profileSlice` |

## 3. Architecture & composition

### 3.1 Files

```
src/stores/slices/
  teachingSlice.ts          # thin shell
  spellingSlice.ts
  languagePacksSlice.ts
  notepadSlice.ts
  pdfSlice.ts
  pianoSlice.ts
  partituresSlice.ts
  pianoRangeSlice.ts
```

### 3.2 Store wiring

- Each file exports `create*Slice: StateCreator<AppStore, [], [], *Slice>`.
- `appStore.ts` spreads all eight into `create()` (teaching shell first among teaching domains, then domain slices; exact order may follow dependency clarity but must not change runtime init semantics).
- Cross-slice coordination uses `get().otherAction()` / shared helpers in `storeShared` and existing `stores/lib/*` — no new facade layer.

### 3.3 Types

- Replace monolithic `TeachingSlice` in `types.ts` with eight interfaces.
- `AppStore` intersects the new interfaces (plus existing non-teaching slices).
- Prefer deleting `TeachingSlice` and fixing any imports that reference it over keeping a long-lived alias. A temporary alias is acceptable only if it unblocks a mechanical compile pass, then remove it in the same change set.

## 4. Ownership map

Keys and action names below stay as they are today unless noted.

### 4.1 `teachingSlice` (shell)

- State: `musicTeachingEnabled`, `teachingLesson`, `languageSubjectTab`, `freeWriteFocus`, `teachingKeyboardMinimized`, `teachingKeyboardAutoFocus`
- Actions: `enableMusicTeaching`, `disableMusicTeaching`, `setTeachingLesson`, `setLanguageSubjectTab`, `setFreeWriteFocus`, keyboard minimize/autofocus setters/toggles, `applyTeachingSession`, `broadcastTeachingSession`
- May call domain actions / shared init helpers when enabling/disabling or switching lesson/tab (same behavior as today)

### 4.2 `spellingSlice`

- State: `languageTaskIndex`, `languageInputBuffer`, `languageAnswerIncorrect`, `languageLessonPlaying`, `languageListAuthoringActive`, `languageListAuthoringField`, `languageListAuthoringHandlers`
- Actions: `restartLanguageLesson`, `startLanguageLessonPlayback`, `stopLanguageLessonPlayback`, authoring setters/register, `languageKeyInput`, `languageBackspace`, `checkLanguageAnswer`

### 4.3 `languagePacksSlice`

- State: `customLanguagePacks`, `languagePackId`
- Actions: `loadCustomLanguagePacks`, `createCustomLanguagePack`, `deleteCustomLanguagePack`, `setLanguagePackId`
- `setLanguagePackId` may reset spelling progress fields in the same `set()` call (one store; allowed cross-field write, matching current behavior)

### 4.4 `notepadSlice`

- Actions: `freeWriteNotepadInput`, `freeWriteNotepadBackspace`, `applyFreeWriteLayoutTranslation`, `setFreeWriteNotepadText`, `clearFreeWriteNotepad`, `setFreeWriteNotepadZoom`, `setFreeWriteNotepadWrap`, `setFreeWriteNotepadLineNumbers`
- Notepad zoom/wrap/line-numbers continue to persist through `updateSettings`

### 4.5 `pdfSlice`

- State: `teachingPdfLibrary`, `freeWriteActivePdfId`, `freeWritePdfTool`, `freeWriteAnnotationDoc`, `freeWriteSelectedTextId`, `freeWriteAnnotationDirty`, `freeWriteUndoDepth`, `freeWriteRedoDepth`
- Actions: library load/pick/close, tool/selection/text-edit, annotation load/save/flush/export/clear, `applyFreeWriteAnnotationUpdater`, undo/redo
- Module-local undo stack + save debounce timers move here with the PDF actions

### 4.6 `pianoSlice`

- State: `musicNoteIndex`, `musicPlaybackActive`
- Actions: `restartMusicLesson`, `reportMusicKeyPlayed`, `startMusicPlayback`, `stopMusicPlayback`, `setMusicPlaybackNoteIndex`, `finishMusicPlayback`
- Reads `musicSongId` / `importedSongs` via `get()` (owned by partitures)

### 4.7 `partituresSlice`

- State: `musicSongId`, `importedSongs`
- Actions: `setMusicSongId`, `loadImportedSongs`, `importMusicSongsFromFile`, `deleteImportedSong`
- After selecting a song, calls `pianoRangeSlice` fit action (extract of today’s inline `songPianoRangeFit` + `updateSettings`)

### 4.8 `pianoRangeSlice`

- Actions only (no duplicated persisted fields), e.g. `fitPianoRangeForSong(song)` (final name chosen in plan)
- Optional thin wrappers if UI later routes octave edits through teaching; initial extract covers the fit path used by teaching enable + song select
- Persisted `settings.synthesizerOctaveCount` / `settings.synthesizerStartOctave` remain owned by `profileSlice` / settings persistence

## 5. Shared helpers

- Keep `dropTeachingSuggestionPrefix`, language lesson init/empty helpers, visibility helpers, etc. in existing shared modules
- Do not copy helpers into each slice
- Shell and spelling may both call `dropTeachingSuggestionPrefix` as today

## 6. Migration & testing

### 6.1 Strategy

1. Split types into eight interfaces; update `AppStore`.
2. Move implementations file-by-file (or shell-first then domains); keep action bodies behavior-identical.
3. Extract range-fit into `pianoRangeSlice`; replace inline call sites.
4. Wire creators in `appStore.ts`.
5. Update tests that import `createTeachingSlice` / paths; move `freeWritePdfPointer.test.ts` with `pdfSlice` if needed.
6. Typecheck + run related store/teaching unit tests.

### 6.2 Success criteria

1. `teachingSlice.ts` is shell-only (session chrome + enable/disable + lesson/tab/focus + session sync).
2. Eight slice files exist with matching interfaces; `appStore` composes all.
3. Public keys/actions unchanged; no required component API migration.
4. Typecheck and existing related tests pass.
5. PDF undo/save module state lives only in `pdfSlice`.

### 6.3 Risks

- Cross-slice field writes (`setLanguagePackId`, lesson init) are intentional and must preserve today’s resets.
- Spread order in `create()` must not drop fields (TypeScript intersection should catch missing keys).
- Avoid accidental behavior changes in `enableMusicTeaching` / `setTeachingLesson` orchestration while moving code.

## 7. Out of scope

- Renaming store keys for domain purity
- Nested teaching store API
- Moving octave fields out of `AppSettings`
- Component folder reorg unrelated to broken imports
- New product features in any teaching domain
}