# Teaching mode: hide preview / suggestions — Design Spec

**Date:** 2026-09-25  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/167  
**Scope:** While a Teaching session is active, hide the live input preview strip and suggestions row for language and math (keyboard layout), without changing Maximize / compact or saved profiles

## 1. Goals

- Entering Teaching gives a keyboard-focused layout: no live preview strip and no suggestions row for language and math lessons.
- Leaving Teaching restores prior preview/suggestions visibility from existing settings (no new restore flags).
- Music Teaching behavior stays equivalent (already hidden via synthesizer chrome).
- Do not persist a “teaching layout” into saved profiles.

## 2. Non-goals

- Auto-toggling `inputAreaCompact` (“Maximize keyboard and trackpad”)
- Capturing / restoring `inputAreaCompact`, `showInputPreview`, or `suggestionsVisible` in session state
- Changing companion, Mini Mode, or settings panel UI
- Hiding other Teaching chrome (phrases, lesson slot, window height)
- Product copy / i18n changes

## 3. Context

`KeyboardSection` already computes:

| Flag | Today |
| --- | --- |
| `showSynth` | Music Teaching only (`isSynthesizerUiActive`) — forces preview/suggestions off |
| `compact` | `settings.inputAreaCompact` — forces preview/suggestions off |
| `showInputPreview` | Off when synth, compact, companion live, or no input target; else mode setting |
| `showSuggestions` | Off when synth or compact; also off when `languageLessonActive` (spelling tab only) |

Language spelling already suppresses suggestions; preview is not Teaching-aware. Math and language free write show both strips when compact is off. Music is already fine via `showSynth`.

Teaching session entry already uses `musicTeachingEnabled` + `keyboardSectionMode === "synthesizer"` (`isTeachingSessionActive`). Exit paths restore phrases / height / mode via existing session fields; they do not need new fields for this change.

## 4. Decision

**Approach B + implementation 1:** Suppress preview and suggestions in `KeyboardSection` whenever `isTeachingSessionActive` is true. Do not mutate compact or preview/suggestions settings.

| Topic | Choice |
| --- | --- |
| Product approach | Explicit suppress while Teaching (not auto-maximize) |
| Where | `src/components/keyboard/KeyboardSection.tsx` only |
| Gate | `isTeachingSessionActive(musicTeachingEnabled, settings.keyboardSectionMode)` |
| Settings / profiles | Unchanged |
| Restore on exit | Implicit — settings still drive visibility after Teaching ends |
| Music | Unchanged in practice (`showSynth` already hides; teaching gate is redundant but harmless) |

## 5. Behavior

### 5.1 Enter Teaching

When `isTeachingSessionActive` is true (any lesson: music, math, language):

- `showInputPreview` is false (add `!teachingSessionActive` to the existing conjunction).
- `showSuggestions` is false (add `!teachingSessionActive` to the existing conjunction).

Height / toolbar layout that already depends on those flags shrinks accordingly (no separate height logic).

### 5.2 Leave Teaching

No new store fields. When `musicTeachingEnabled` becomes false (or session otherwise ends so `isTeachingSessionActive` is false), existing `settings` and non-teaching gates decide visibility again.

### 5.3 Mid-session settings

If the user toggles Live input preview or suggestions in Settings during Teaching, stored values may change but chrome stays hidden until Teaching ends. Compact remains independently usable.

## 6. Testing

- No new session capture/restore flags ⇒ no new restore-logic unit tests (issue acceptance only required those if flags were added).
- `isTeachingSessionActive` is already unit-tested in `appModeLayout.test.ts`; this change only consumes it in `KeyboardSection`.
- Manual QA: with compact off and preview/suggestions on, enter language spelling, language free write, and math → both strips gone; stop Teaching → strips return per settings; music Teaching still has no strips; save/load profile → compact and preview/suggestions settings unchanged by having entered Teaching.

## 7. Acceptance mapping

| Criterion (issue #167) | How met |
| --- | --- |
| Keyboard-focused layout for language/math | Teaching gate hides preview + suggestions |
| Leave restores prior state; profiles unchanged | No settings mutation; restore is passive |
| Music unchanged or aligned | Still hidden (synth + same gate) |
| Tests for restore/capture if new flags | N/A — no new session flags |

## 8. Out of scope follow-ups

- Auto-maximize (`inputAreaCompact`) as an alternate product choice
- Extracting a shared `teachingHidesInputChrome` helper (only if a second caller appears)
