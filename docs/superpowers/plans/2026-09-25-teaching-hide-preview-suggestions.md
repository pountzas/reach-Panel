# Teaching hide preview/suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While Teaching is active, hide the live input preview strip and suggestions row for language/math keyboard layouts without mutating compact or profile settings.

**Architecture:** Gate `showInputPreview` and `showSuggestions` in `KeyboardSection` with existing `isTeachingSessionActive`. No store session flags, no settings writes, no restore logic — leaving Teaching restores visibility because settings were never changed.

**Tech Stack:** React + TypeScript, Zustand `useAppStore`, Vitest, existing `appModeLayout` helpers.

## Global Constraints

- Windows-only product; do not add macOS/Linux paths.
- Do not toggle or persist `inputAreaCompact`.
- Do not add `phrasesVisibleBeforeTeaching`-style capture fields for preview/suggestions/compact.
- Do not change companion, Mini Mode, or Settings panel UI.
- Music Teaching must remain without preview/suggestions (already true via `showSynth`; teaching gate is additive).
- Spec: `docs/superpowers/specs/2026-09-25-teaching-hide-preview-suggestions-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/167

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/components/keyboard/KeyboardSection.tsx` | Import `isTeachingSessionActive`; suppress preview + suggestions when Teaching session is active |
| `src/lib/appModeLayout.ts` | Unchanged (consume `isTeachingSessionActive` only) |
| `src/stores/appStore.ts` | Unchanged (no new session flags) |

---

### Task 1: Gate preview and suggestions during Teaching

**Files:**
- Modify: `src/components/keyboard/KeyboardSection.tsx`

**Interfaces:**
- Consumes: `isTeachingSessionActive(musicTeachingEnabled: boolean, keyboardSectionMode: string): boolean` from `../../lib/appModeLayout` (already exported; true when Teaching is on and `keyboardSectionMode === "synthesizer"`).
- Produces: no new exports.

- [ ] **Step 1: Update imports**

In `src/components/keyboard/KeyboardSection.tsx`, change:

```tsx
import {
  isSynthesizerUiActive,
} from "../../lib/appModeLayout";
```

to:

```tsx
import {
  isSynthesizerUiActive,
  isTeachingSessionActive,
} from "../../lib/appModeLayout";
```

- [ ] **Step 2: Compute teaching session flag and apply gates**

Immediately after `const compact = settings.inputAreaCompact;`, add:

```tsx
  const teachingSessionActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
```

Replace `showInputPreview` with:

```tsx
  const showInputPreview =
    !showSynth &&
    !compact &&
    !teachingSessionActive &&
    !companionSessionLive &&
    hasInputTarget &&
    isInputPreviewActiveForMode(settings, miniModeActive);
```

Replace `showSuggestions` with:

```tsx
  const showSuggestions =
    !showSynth &&
    settings.suggestionsVisible &&
    !compact &&
    !teachingSessionActive &&
    !languageLessonActive;
```

Keep `languageLessonActive` defined before `showSuggestions` (order unchanged from today).

- [ ] **Step 3: Run unit tests**

Run: `npm test`

Expected: PASS (no new failing tests; existing `appModeLayout` / language lesson tests still green).

- [ ] **Step 4: Manual QA checklist**

With **Maximize keyboard and trackpad** off, Live input preview on, suggestions bar on:

1. Enter Teaching → **language** spelling → preview strip and suggestions row absent; keys have more vertical room.
2. Switch to language **free write** → still absent.
3. Switch to **math** → still absent.
4. Switch to **music** → still absent (synth path).
5. Stop Teaching / leave to Normal → preview and suggestions return per settings.
6. Save profile before Teaching, enter Teaching, leave Teaching, reload profile → `inputAreaCompact` and preview/suggestions settings unchanged by the Teaching session.

- [ ] **Step 5: Commit**

```bash
git add src/components/keyboard/KeyboardSection.tsx
git commit -m "fix: hide preview and suggestions during Teaching (#167)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Hide preview + suggestions for language/math while Teaching | Task 1 Step 2 |
| Leave Teaching restores prior visibility; profiles unchanged | Implicit (no settings mutation) — verified Step 4.5–4.6 |
| Music unchanged / aligned | Task 1 gate + existing `showSynth`; QA Step 4.4 |
| No new session restore flags / tests | No Task 2; Step 3 runs existing suite only |
| Non-goals (compact auto-toggle, Settings UI, companion) | Not in file map |

No placeholders. Types match existing `isTeachingSessionActive` signature.
