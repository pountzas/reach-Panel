# Teaching input helpers toggle + animated Settings switch — Design Spec

**Date:** 2026-10-15  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/262  
**Supersedes (Teaching hard-hide):** `docs/superpowers/specs/2026-09-25-teaching-hide-preview-suggestions-design.md` (#167)  
**Scope:** Windows app only. Companion does not follow this setting.

## 1. Goals

- Add one Settings toggle, **Show input helpers in Teaching mode**, that shows or hides the suggestions bar, mic (dictation) key, and live input preview **as a group**, only while Teaching mode is active.
- Default **on** so existing Non-Teaching behavior is unchanged and, with helpers on, Teaching again shows those helpers according to Visible Sections (replacing #167’s unconditional hide).
- Persist the setting across restart (and profiles, via normal `AppSettings` JSON).
- Live-update layout when toggled during an open Teaching session, with no empty gaps.
- Hiding the mic stops any in-progress dictation.
- On the same branch, in a **second commit**, replace Settings checkboxes with a reusable animated switch used by `ToggleRow`.

## 2. Non-goals

- Changing Normal, Focus, Mini, or Companion chrome for this setting
- Syncing the setting to the companion app
- Mutating `suggestionsVisible`, `dictationVisible`, or `inputPreviewVisible` when the Teaching helpers toggle changes
- Auto-maximize / `inputAreaCompact` as a substitute for this toggle
- Redesigning mode tablets or Teaching lesson chips
- Using the animated switch outside Settings in this work (only `ToggleRow` consumers)

## 3. Decisions (from brainstorming)

| Topic | Choice |
| --- | --- |
| Product approach | New persisted `showTeachingInputHelpers` (default `true`) |
| Relation to #167 | **Replace** the hard Teaching hide; helpers on restores preview/suggestions/mic under existing gates |
| Compact / Music synth | Still win when helpers are on |
| Language spelling suggestions suppress | **Bypassed** when helpers are on (suggestions may show in spelling) |
| Settings placement | Always visible in `ModesSection`, directly under the mode tablets |
| Hint copy | One-line muted hint under the toggle (helpers = suggestions, mic, live preview; Teaching only) |
| Animated switch packaging | Same branch; **commit 2** after helpers (two logical commits / stacked review) |
| Toggle implementation | Upgrade `ToggleRow`’s native checkbox → reusable `AnimatedToggle` |

## 4. Setting

### 4.1 Schema

Add to `AppSettings` / `DEFAULT_SETTINGS`:

```ts
/** When false, hide suggestions, mic, and live input preview while Teaching is active. Default true. */
showTeachingInputHelpers?: boolean;
```

Default: `true`. On load, treat missing as `true` (`parsed.showTeachingInputHelpers ?? true`).

### 4.2 Semantics

Let `teachingSessionActive = isTeachingSessionActive(musicTeachingEnabled, keyboardSectionMode)`.

| Condition | Preview | Suggestions | Mic key |
| --- | --- | --- | --- |
| Not Teaching | Unchanged (existing mode / Visible Sections / compact / synth rules) | Same | Same (`dictationVisible`) |
| Teaching + helpers **on** | Existing non-Teaching gates **except** remove `#167` `!teachingSessionActive` suppress | Same, and **do not** apply `languageLessonActive` suggestions suppress | `dictationVisible` |
| Teaching + helpers **off** | Forced off | Forced off | Forced off; stop dictation if not idle |

Compact (`inputAreaCompact`) and Music synthesizer UI (`showSynth`) continue to force preview/suggestions off even when helpers are on.

### 4.3 UI

In `ModesSection`, immediately after the 5 mode tablets (before Teaching lesson chips / Focus transparent controls):

- `ToggleRow` bound to `showTeachingInputHelpers`
- Label i18n: Show input helpers in Teaching mode
- Short muted description under the row

Visible regardless of selected mode tablet.

## 5. Code touch points (commit 1)

| Area | Change |
| --- | --- |
| `src/lib/types.ts` | Field + default |
| Settings load / migrate | `?? true` |
| Pure helper (preferred) | e.g. `teachingShowsInputHelpers(settings, teachingSessionActive)` or gate helpers for preview / suggestions / mic |
| `KeyboardSection.tsx` | Replace unconditional `!teachingSessionActive` on preview/suggestions with helpers-aware gates; skip `languageLessonActive` suggestions hide when helpers on |
| `Keyboard.tsx` | Hide dictate key when Teaching + helpers off (in addition to `!dictationVisible`); extend stop-dictation effect for that case |
| `ModesSection.tsx` | Toggle + hint |
| i18n (`en` + existing locales) | Label + hint keys |
| Tests | Gate matrix unit tests; mic-stop when helpers turn off during Teaching |

Companion and other modes: no reads of this flag for layout.

## 6. Animated Settings switch (commit 2)

- Extract reusable control (e.g. `AnimatedToggle`) with `checked`, `onChange`, `disabled`, `surface` (or colors derived from `SurfaceColors`).
- Visual: pill track + sliding thumb; CSS transition; `role="switch"` + `aria-checked`.
- Disabled: reduced opacity, non-interactive.
- Prefer `prefers-reduced-motion: reduce` → minimal/no thumb travel animation.
- Wire exclusively through `ToggleRow` so every Settings boolean row upgrades together (today the only `type="checkbox"` in the app).
- No settings value/behavior changes in this commit.
- Optional light test for role / checked / disabled if similar component tests exist.

## 7. Acceptance mapping (#262)

| Criterion | How met |
| --- | --- |
| Toggle always in Settings below mode options | `ModesSection` under tablets |
| Single toggle controls all three | One setting gates preview, suggestions, mic in Teaching |
| Only affects Teaching | Gates keyed on `teachingSessionActive` |
| Doesn’t change other settings | Writes only `showTeachingInputHelpers` |
| On by default | `DEFAULT_SETTINGS` + load `?? true` |
| Survives restart | Persisted in settings / profiles JSON |
| Live update, no empty gaps | Reactive store; existing layout flags collapse chrome |
| Hiding mic stops recording | Effect when Teaching helpers hide mic |
| Windows only; companion ignores | No companion plumbing |

## 8. Packaging

1. **Commit 1:** Teaching helpers setting + visibility + tests + i18n (checkbox `ToggleRow` still fine).
2. **Commit 2:** `AnimatedToggle` + `ToggleRow` swap (+ optional component test).

Same branch; reviewable as two commits or stacked PRs.

## 9. Testing

- Unit: Teaching on/off × helpers on/off × compact/synth/spelling × Visible Sections flags for the three chrome pieces.
- Unit/integration: turning helpers off while Teaching and dictation listening → `stopDictation`.
- Manual QA: toggle in Settings while Teaching open; Normal/Focus/Mini unchanged; restart persistence; companion unaffected.
`}