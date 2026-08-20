# ReachPanel Language Lesson — Design Spec

**Date:** 2026-08-20  
**Status:** Draft for review  
**Scope:** `teachingLessonLanguage` — guided spelling and copy-typing lessons in Teaching mode (Windows host)

## 1. Goals

- A student with severe motor disability completes **school language homework** using only the ReachPanel touchscreen keyboard — no separate typing tutor app.
- Support **Modern Greek (EL)** and **English (EN)** as first-class lesson languages, with age/grade-appropriate built-in content.
- All tasks are **keyboard-validated** (type the answer; no tap-to-choose as the primary interaction).
- **Three content sources:** built-in grade packs, caregiver-authored lists, teacher-shared import files.
- Mirror the Music lesson UX: one step at a time, visible progress, restart, completion feedback, import/delete — adapted for text instead of piano keys.

## 2. Non-goals (this product cut)

- Replacing Word / Teams / browser for long-form essays (lesson panel guides drills; student still uses Normal mode for assignments).
- Duolingo-style gamification, streaks, or cloud accounts.
- Tablet companion hosting Language lessons (Teaching stays Windows-only, same as Music).
- Tap-to-choose / multiple-choice as the default task type (may appear later as an accessibility override, not v1).
- Auto-grading open-ended writing or AI essay feedback.
- Ancient Greek, French, or other lesson languages until EL + EN ship.

## 3. Context (existing product)

| Today | Language lesson target |
| --- | --- |
| `LanguageLessonPanel` shows “Coming soon” | Full lesson UI in the phrases slot |
| Teaching default lesson = `language` | Keep default |
| Music: `MusicLessonPanel` + synth keyboard | Language: lesson panel + **normal keyboard** |
| `musicTeachingEnabled` gates Teaching session | Reuse; rename optional later |
| Imported songs → `app_data/music/imported-songs.json` | Imported packs → **per-profile SQLite** |
| Offline word packs for prediction | Reuse normalization ideas; separate from lesson validation |
| WinRT TTS / dictation on host | TTS for “read word aloud”; dictation not used for grading in v1 |

**Layout (Language selected):**

```text
+---------------------------------------------------+
| LanguageLessonPanel (lesson picker, prompt, strip)|
+---------------------------------------------------+
| Keyboard (+ suggestions row as today)             |
+---------------------------------------------------+
```

Fullscreen work area (`isTeachingFullWorkArea`) stays on — same as Music.

## 4. Users & jobs

| Actor | Job |
| --- | --- |
| **Student** | Complete spelling list or copy exercise step-by-step with large prompts and clear progress |
| **Caregiver** | Pick grade band, assign this week’s list, import teacher file, create a quick custom list |
| **Teacher** | Export a simple file (JSON / CSV / TXT) students’ caregivers import at home |

## 5. Age / grade model

Lessons are tagged with an **age band** that drives defaults (not hard locks):

| Band ID | Typical age | Greek school | English (FL) | Defaults |
| --- | --- | --- | --- | --- |
| `early` | 6–8 | Α'–Β' Δημοτικού | — (pre-FL) | Shorter words, larger prompt text, show word 5s before hide, hints on |
| `primary` | 9–11 | Γ'–ΣΤ' Δημοτικού | starts ~Γ' | Medium words, show 3s, hints optional |
| `lower_secondary` | 12–14 | Α'–Γ' Γυμνασίου | active | Longer words, copy sentences, show-until-type |
| `upper_secondary` | 15+ | optional | active | Multi-word copy chunks, minimal hints |

**Profile setting:** `languageLessonAgeBand: "early" | "primary" | "lower_secondary" | "upper_secondary"`  
Default: `primary`. Caregiver changes in Settings → Teaching → Language.

Built-in packs declare `ageBand` + `lessonLanguage: "el" | "en"`. UI filters picker to profile band ± one step (caregiver can widen in settings).

## 6. Task types (keyboard-only)

v1 ships two task kinds; both advance only on validated keyboard input.

### 6.1 `spell` — spelling drill

- **Prompt:** target word shown large (and optionally read via TTS).
- **Input:** student types the word; presses **Enter** or taps **Check** (large toolbar button for touch).
- **Advance:** normalized match → next step; mismatch → shake/highlight, stay on step (unlimited retries).
- **Options per step:** `hint` (sentence using the word), `showSeconds` (hide prompt after N seconds; 0 = stay visible).

### 6.2 `copy` — copy typing

- **Prompt:** source text (word, phrase, or sentence) fixed in panel.
- **Input:** student types into a **lesson-local buffer** displayed under the prompt (not injected into external apps until step completes — avoids polluting Word).
- **Advance:** buffer matches expected text (character-by-character or word-by-word — see §8).
- **Use case:** dictation-style homework, sentence copying, English FL drills.

**v1.1 (explicitly later):** `dictation` — TTS reads text once; prompt hidden; student types from memory (still keyboard-graded).

## 7. Lesson & pack data model

```typescript
/** Lesson language — not UI locale. */
export type LessonLanguage = "el" | "en";

export type LanguageAgeBand =
  | "early"
  | "primary"
  | "lower_secondary"
  | "upper_secondary";

export type LanguageTask =
  | {
      type: "spell";
      /** Exact expected answer after normalization. */
      answer: string;
      hint?: string;
      /** 0 = always show; default from age band. */
      showSeconds?: number;
    }
  | {
      type: "copy";
      answer: string;
      /** If true, match word boundaries only (for long sentences). */
      wordAtATime?: boolean;
    };

export type LanguagePack = {
  id: string;
  title: string;
  description?: string;
  lessonLanguage: LessonLanguage;
  ageBand: LanguageAgeBand;
  /** Optional author metadata for teacher imports. */
  author?: string;
  tasks: LanguageTask[];
};

/** Imported / caregiver-created packs. */
export type ImportedLanguagePack = LanguagePack & {
  source: "imported" | "caregiver";
  profileId: string;
  importedAt: string;
  sourcePath?: string;
};
```

**Built-in packs** live in `src/lib/language/builtInPacks.ts` (parallel to `BUILT_IN_SONGS`).

**Session state** (Zustand, session-only like `musicNoteIndex`):

```typescript
languagePackId: string | null;
languageTaskIndex: number;
languageInputBuffer: string; // copy tasks; cleared on advance
languagePromptHidden: boolean; // spell hide-after-timeout
languageLessonComplete: boolean;
```

## 8. Text normalization & grading

Shared helper `normalizeLessonText(text, lessonLanguage)`:

| Rule | EL | EN |
| --- | --- | --- |
| Trim outer whitespace | ✓ | ✓ |
| Case | optional ignore (setting default: ignore) | optional ignore |
| Final punctuation | strip trailing `.`, `;`, `!`, `?` for spell | same |
| Greek tonos/monotonic | NFC; treat ά/ά as equivalent | — |
| English apostrophes | — | `'` vs `'` normalized |

**Spell:** compare normalized buffer to normalized `answer` on Check / Enter.

**Copy — two modes:**

- `wordAtATime: false` — full string match (primary/secondary sentences).
- `wordAtATime: true` — highlight current word in prompt; advance word index on space or word match (early band long sentences).

**Feedback:**

- Correct: brief green flash, advance, update progress strip.
- Incorrect: red border on input line, optional TTS “Try again” (UI string only in v1).

No injection into foreground app during the lesson. Optional v2: “Send to app” button copies finished text via existing input pipeline.

## 9. UI specification

### 9.1 LanguageLessonPanel (replaces placeholder)

Two-column layout like Music (simplified):

**Left column — controls**

- Title: “Language” / localized
- Toolbar (icon buttons + tooltips, same pattern as Music):
  - **Load pack** — file picker import
  - **New list** — caregiver quick-create dialog (title + paste words, one per line)
  - **Read aloud** — Windows TTS for current prompt (`lessonLanguage` voice)
  - **Restart**
  - **Delete** — imported/caregiver packs only
- Pack selector (`<select>`): Built-in / Imported / My lists
- Metadata: `{title}`, `{progress}`, `{lessonLanguage flag}`, `{ageBand label}`
- Completion banner (reuse `lessonComplete` i18n key pattern)

**Right column — prompt**

- Large prompt area (`text-2xl` early band, `text-xl` primary, `text-lg` secondary)
- For `copy`: source text with current word highlighted when `wordAtATime`
- Input echo row: shows `languageInputBuffer` + caret (read-only display; keys come from host keyboard below)

**Bottom strip — progress**

- Horizontal chip strip (reuse Music note-strip CSS): one chip per task; active / past / upcoming states

### 9.2 Keyboard integration

- While `teachingLesson === "language"` and session active:
  - Keyboard keys append to `languageInputBuffer` (copy) or replace buffer (spell — single word, no spaces except for copy).
  - **Backspace** edits buffer.
  - **Enter** triggers check.
  - Space allowed only for `copy` tasks.
- Suggestions row: **disabled during active language task** (avoid cheating on spelling). Setting override later.
- Sticky modifiers: no change.

### 9.3 Settings → Teaching → Language

| Control | Purpose |
| --- | --- |
| Age band | Default filter + showSeconds |
| Lesson language filter | `el` / `en` / both |
| Ignore case when checking | default on |
| Hide prompt after (seconds) | override band default; 0 = always show |
| Default pack per language | optional last-selected persistence in profile settings |

### 9.4 Caregiver “New list” dialog

Minimal modal:

1. Title (required)
2. Lesson language (`el` / `en`)
3. Age band
4. Task type: Spelling (one word per line) or Copy (one sentence per line)
5. Multiline paste area
6. Save → creates `caregiver` pack in SQLite for active profile

## 10. Content authoring & import

### 10.1 Built-in starter packs (ship with app)

| ID | Language | Band | ~Tasks | Notes |
| --- | --- | --- | --- | --- |
| `el-sight-early-01` | EL | early | 20 | High-frequency monosyllables |
| `el-spell-primary-01` | EL | primary | 25 | School spelling patterns |
| `en-sight-early-01` | EN | early | 20 | Dolch-style subset |
| `en-spell-primary-01` | EN | primary | 25 | Common FL vocabulary |
| `el-copy-primary-01` | EL | primary | 10 | Short sentences |
| `en-copy-lower-01` | EN | lower_secondary | 10 | FL copy drills |

Content review: caregiver + teacher sign-off before release (accuracy, age fit).

### 10.2 Teacher import formats

**A. ReachPanel JSON (canonical)** — extension `.reachlang.json`

```json
{
  "format": "reachpanel-language-pack",
  "version": 1,
  "title": "Εβδομάδα 12 — Ορθογραφία",
  "lessonLanguage": "el",
  "ageBand": "primary",
  "author": "Ms. Papadopoulou",
  "tasks": [
    { "type": "spell", "answer": "λέξη", "hint": "Γράφω μια ___ στο τετράδιο." },
    { "type": "copy", "answer": "Η γάτα κοιμάται στον ήλιο." }
  ]
}
```

**B. Plain text** — `.txt`

- One line = one `spell` task (`answer` = line).
- Metadata from filename or import dialog (language, band, title).

**C. CSV** — `.csv`

```csv
type,answer,hint
spell,hello,
spell,world,The ___ is round.
copy,"The cat sits.", 
```

Import validates UTF-8, max 500 tasks/pack, max 512 chars/answer, rejects empty.

### 10.3 Distribution workflow for teachers

1. Teacher builds CSV/JSON (template downloadable from project docs later).
2. Shares via email / Teams / USB.
3. Caregiver: Teaching → Language → Load pack (or Settings import).
4. Pack appears under **Imported** for that Windows install; stored against **active profile**.

## 11. Persistence & storage

| Data | Storage | Scope |
| --- | --- | --- |
| Built-in packs | TS bundle | App |
| Imported / caregiver packs | SQLite table `language_packs` | Per `profile_id` |
| Last selected pack id | `AppSettings.languageLessonPackId` | Per profile |
| Age band & check options | `AppSettings` | Per profile |
| Session index / buffer | Zustand only | Session |

**SQLite schema (sketch):**

```sql
CREATE TABLE language_packs (
  id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL,
  lesson_language TEXT NOT NULL,
  age_band TEXT NOT NULL,
  author TEXT,
  source TEXT NOT NULL,  -- 'imported' | 'caregiver'
  tasks_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (id, profile_id)
);
```

Tauri commands (mirror music):

- `cmd_list_language_packs`
- `cmd_upsert_language_pack`
- `cmd_delete_language_pack`
- `cmd_pick_language_pack_file`
- `cmd_read_language_pack_file`

## 12. TTS & accessibility

- **Read aloud:** WinRT `SpeechSynthesizer` with voice matching `lessonLanguage` (fallback to any installed voice; show warning if missing).
- Prompt text respects `settings.largeHeaders` / future lesson font size setting.
- Progress strip: `aria-live="polite"` on progress label.
- High contrast: use existing `getSurfaceColors`; active chip uses same amber highlight as Music (`#fde68a`).
- Motor: entire Check action reachable via Enter; optional on-screen **Check** button ≥ 40×40 px.

## 13. Implementation phases

### Phase 1 — MVP (single vertical)

- [ ] Types + `normalizeLessonText` + Vitest
- [ ] 2 built-in packs (EL + EN spell, primary band)
- [ ] Session state + keyboard capture hook
- [ ] `LanguageLessonPanel` UI (picker, prompt, strip, restart)
- [ ] Spell-only grading
- [ ] Profile setting: age band

**Exit:** Student completes a built-in spelling list end-to-end in Teaching → Language.

### Phase 2 — Import & caregiver create

- [ ] SQLite + Tauri CRUD
- [ ] JSON + TXT import
- [ ] Caregiver “New list” dialog
- [ ] Delete imported pack

**Exit:** Teacher CSV/JSON → caregiver import → student runs list.

### Phase 3 — Copy typing + polish

- [ ] `copy` task type + word-at-a-time mode
- [ ] CSV import
- [ ] TTS read aloud
- [ ] Remaining built-in packs
- [ ] i18n for all new strings (`en`, `de`, `el`, `es`, `fr`, `it`, `pt`)

**Exit:** Full v1 spec; README + accessibility-requirements updated.

### Phase 4 — Later

- Dictation task (TTS-only prompt)
- Per-task stats / history
- “Promote to Phrases” for mastered sentences
- Export pack from app (caregiver sends back to teacher)

## 14. File structure (planned)

| Path | Responsibility |
| --- | --- |
| `src/lib/language/types.ts` | Pack + task types |
| `src/lib/language/normalize.ts` | Grading normalization |
| `src/lib/language/builtInPacks.ts` | Shipped content |
| `src/lib/language/parsePackFile.ts` | JSON / TXT / CSV parsers |
| `src/lib/language/validate.ts` | Task/pack validation |
| `src/components/teaching/LanguageLessonPanel.tsx` | Main UI |
| `src/components/teaching/LanguagePackEditor.tsx` | Caregiver create dialog |
| `src/stores/appStore.ts` | Session state + actions |
| `src-tauri/src/language_packs.rs` | SQLite + file picker |
| `src/lib/language/*.test.ts` | Unit tests |

## 15. Acceptance criteria

| # | Criterion |
| --- | --- |
| L1 | Teaching → Language shows lesson panel + keyboard (no synth) |
| L2 | Built-in EL and EN spelling packs selectable by age band |
| L3 | Progress strip and `N / M` counter update on each correct step |
| L4 | Incorrect input does not advance; unlimited retries |
| L5 | Restart resets index and buffer |
| L6 | Import JSON/TXT adds pack visible only for current profile |
| L7 | Caregiver can create spelling list from pasted words |
| L8 | Keyboard-only: no tap-to-select answer shortcuts in v1 |
| L9 | Greek answers grade correctly with tonos normalization |
| L10 | Leaving Teaching restores prior Normal/Mini layout (existing behavior) |
| L11 | Companion session unchanged — Language not on tablet |

## 16. Open questions

1. **Suggestions off during lesson** — confirm caregivers accept reduced typing aid during drills.
2. **Global vs per-profile imports** — spec chooses per-profile; music imports are global today (intentional difference).
3. **Rename `musicTeachingEnabled`** → `teachingSessionEnabled` during Language work or defer.
4. **Maximum copy length** — propose 120 chars/task for v1 to keep prompt readable on touch layout.

---

**Next step:** Review this spec; when approved, split Phase 1 into an implementation plan (`docs/superpowers/plans/2026-08-20-language-lesson-phase1.md`).
