# Language Lesson — Phase 1 Implementation Plan

> **Prerequisite:** [Language lesson design spec](./2026-08-20-language-lesson-design.md) approved.  
> **Goal:** Spell-only MVP — built-in EL/EN packs, keyboard grading, progress UI in Teaching → Language.

**Architecture:** Mirror Music lesson session state in Zustand; intercept keyboard input when `teachingLesson === "language"`. Built-in packs in TS; no SQLite until Phase 2. Grading via pure `normalizeLessonText` helper with Vitest coverage for Greek tonos + English case.

**Tech stack:** React 19, Zustand, Vitest, existing keyboard component hook point, Win32 TTS deferred to Phase 3.

## Global constraints

- Windows-only; Teaching stays host-only (no companion changes).
- Keyboard-only validation — no tap-to-choose answers.
- i18n: add keys to `en.ts` first, mirror in `de`, `el`, `es`, `fr`, `it`, `pt`.
- Do not rename `musicTeachingEnabled` in Phase 1.
- Disable suggestion taps during active language step (prevent spelling cheat).
- README + `docs/accessibility-requirements.md` update in Phase 3 only (not Phase 1).

---

## Task 1: Core types & normalization

**Files:**
- Create: `src/lib/language/types.ts`
- Create: `src/lib/language/normalize.ts`
- Create: `src/lib/language/normalize.test.ts`

**Deliverables:**
- `LanguagePack`, `LanguageTask`, `LessonLanguage`, `LanguageAgeBand` types
- `normalizeLessonText(text, lang, options?)` with NFC, tonos, case, trailing punct
- Tests: `λέξη` vs `λέξη.`, `Hello` vs `hello`, apostrophe variants

- [ ] Write failing tests
- [ ] Implement normalize
- [ ] Export from `src/lib/language/index.ts`

---

## Task 2: Built-in packs

**Files:**
- Create: `src/lib/language/builtInPacks.ts`
- Create: `src/lib/language/builtInPacks.test.ts`

**Deliverables:**
- `BUILT_IN_LANGUAGE_PACKS` array (min 2: `el-spell-primary-01`, `en-spell-primary-01`, ~10 words each for dev)
- `getLanguagePackById(id, imported?)` helper
- `filterPacksByBand(packs, band)` helper

- [ ] Seed realistic primary-band words (Greek + English)
- [ ] Test pack shape validation (non-empty tasks, valid types)

---

## Task 3: Session state in appStore

**Files:**
- Modify: `src/stores/appStore.ts`

**State (session-only):**
```typescript
languagePackId: string | null;  // default first built-in for band
languageTaskIndex: number;
languageInputBuffer: string;
languagePromptHidden: boolean;
```

**Actions:**
- `setLanguagePackId(id)`
- `restartLanguageLesson()`
- `languageKeyInput(key: string)` — append/backspace
- `checkLanguageAnswer()` — normalize compare, advance or error
- Reset language state in `enableMusicTeaching` / `disableMusicTeaching` / lesson switch away from language

**Wire:** default `languagePackId` when entering Teaching with `teachingLesson === "language"`.

- [ ] Implement actions
- [ ] Reset on teaching session end

---

## Task 4: Keyboard capture

**Files:**
- Modify: `src/components/keyboard/Keyboard.tsx` (or key dispatch path)
- Create: `src/lib/language/isLanguageLessonActive.ts`

**Behavior when language lesson active:**
- Character keys → `languageKeyInput`
- Backspace → trim buffer
- Enter → `checkLanguageAnswer`
- Block Space for `spell` tasks
- Do not invoke normal injection for printable keys during lesson

- [ ] Identify single dispatch point (same pattern as synth `advanceMusicOnKey`)
- [ ] Unit test dispatch guard with mocked store

---

## Task 5: LanguageLessonPanel UI

**Files:**
- Modify: `src/components/teaching/LanguageLessonPanel.tsx`
- Modify: `src/i18n/en.ts` (+ other locales)

**UI (spell-only subset of spec §9.1):**
- Pack `<select>` (built-in group only in Phase 1)
- Toolbar: Restart (icon)
- Prompt: large `answer` word (respect hide-after-timeout later — show always in P1)
- Input echo line showing buffer
- Progress label + chip strip (reuse Music strip CSS classes)
- Completion message

Mirror MusicLessonPanel structure for consistency.

- [ ] Replace placeholder
- [ ] i18n keys: `languageLesson`, `selectLanguagePack`, `languagePrompt`, `languageYourAnswer`, `languageCheck`, `languageIncorrect`, `languagePackBuiltIn`, etc.

---

## Task 6: Settings — age band

**Files:**
- Modify: `src/lib/types.ts` — `languageLessonAgeBand?: LanguageAgeBand`
- Modify: `src/components/settings/SettingsPanel.tsx` — Teaching section when visible
- Default: `primary`

**Behavior:** Filter built-in pack list in LanguageLessonPanel by selected band.

- [ ] Persist in profile settings
- [ ] Migration: undefined → `primary`

---

## Task 7: Manual smoke test

- [ ] Enter Teaching → Language (default)
- [ ] Complete EL pack spelling list
- [ ] Switch to EN pack, complete
- [ ] Restart mid-lesson
- [ ] Switch to Music and back — state resets appropriately
- [ ] Verify suggestions do not inject during lesson

---

## Phase 1 exit checklist

- [ ] All Vitest tests pass (`npm test`)
- [ ] Spec acceptance criteria L1–L5, L8–L10 satisfied
- [ ] No regressions to Music lesson

**Follow-on:** Phase 2 plan for SQLite + import + caregiver editor.
