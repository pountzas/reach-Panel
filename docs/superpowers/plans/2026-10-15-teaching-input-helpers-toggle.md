# Teaching input helpers toggle + animated Settings switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted Settings toggle that shows or hides suggestions, mic, and live input preview together in Teaching mode (#262), then upgrade Settings checkboxes to a reusable animated switch on the same branch.

**Architecture:** One `AppSettings` flag (`showTeachingInputHelpers`, default true) drives Teaching-only chrome via pure gate helpers. `KeyboardSection` / `Keyboard` consume those gates (replacing #167’s hard `!teachingSessionActive` hide). A second commit swaps `ToggleRow`’s native checkbox for `AnimatedToggle` with no settings semantics changes.

**Tech Stack:** React 19 + TypeScript, Zustand, Vitest, existing `ToggleRow` / `SurfaceColors` Settings patterns, Tauri Windows app.

## Global Constraints

- Windows-only product; do not add macOS/Linux paths.
- Spec: `docs/superpowers/specs/2026-10-15-teaching-input-helpers-toggle-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/262
- Supersedes Teaching hard-hide from #167 / `2026-09-25-teaching-hide-preview-suggestions-design.md`
- Do not mutate `suggestionsVisible`, `dictationVisible`, or `inputPreviewVisible` when the Teaching helpers toggle changes
- Companion must not sync or follow `showTeachingInputHelpers`
- Compact and Music synth chrome still hide preview/suggestions when helpers are on
- When helpers are on during Teaching, do not suppress suggestions for language spelling (`languageLessonActive`)
- Packaging: commit 1 = helpers feature; commit 2 = animated switch (same branch)
- Do not change `applySuggestion`’s language-lesson early return (chips may show; apply stays blocked)

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/lib/types.ts` | `showTeachingInputHelpers` on `AppSettings` + `DEFAULT_SETTINGS` |
| `src/stores/storeShared.ts` | Load default `?? true` for older profiles |
| `src-tauri/src/db/mod.rs` | Seed JSON default `true` for new DBs |
| `src/lib/teachingInputHelpers.ts` | Pure gates for helpers enabled / chrome visibility |
| `src/lib/teachingInputHelpers.test.ts` | Gate matrix unit tests |
| `src/components/keyboard/KeyboardSection.tsx` | Preview + suggestions use helpers gates |
| `src/components/keyboard/Keyboard.tsx` | Mic key visibility + stop dictation when Teaching hides mic |
| `src/components/settings/ModesSection.tsx` | Toggle + hint under mode tablets |
| `src/i18n/en.ts` (+ `el`, `de`, `fr`, `es`, `it`, `pt`) | Label + hint keys |
| `src/components/settings/AnimatedToggle.tsx` | Reusable animated switch (commit 2) |
| `src/components/settings/AnimatedToggle.test.tsx` | role / checked / disabled (commit 2) |
| `src/components/settings/settingsControls.tsx` | `ToggleRow` wires `AnimatedToggle` (commit 2) |

---

### Task 1: Setting schema + pure visibility gates (TDD)

**Files:**
- Create: `src/lib/teachingInputHelpers.ts`
- Create: `src/lib/teachingInputHelpers.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/stores/storeShared.ts` (legacyFill)
- Modify: `src-tauri/src/db/mod.rs` (seed defaults JSON)

**Interfaces:**
- Consumes: `AppSettings` from `./types`
- Produces:
  - `teachingInputHelpersEnabled(settings: AppSettings): boolean` — `settings.showTeachingInputHelpers !== false`
  - `teachingHidesInputHelpers(teachingSessionActive: boolean, settings: AppSettings): boolean` — Teaching active AND helpers disabled
  - `shouldSuppressLanguageSuggestions(languageLessonActive: boolean, settings: AppSettings): boolean` — `languageLessonActive && !teachingInputHelpersEnabled(settings)`
  - `isDictationKeyVisible(settings: AppSettings, teachingSessionActive: boolean): boolean` — `dictationVisible` and not `teachingHidesInputHelpers`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/teachingInputHelpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import {
  isDictationKeyVisible,
  shouldSuppressLanguageSuggestions,
  teachingHidesInputHelpers,
  teachingInputHelpersEnabled,
} from "./teachingInputHelpers";

describe("teachingInputHelpers", () => {
  it("defaults helpers to enabled when setting is missing", () => {
    expect(teachingInputHelpersEnabled(DEFAULT_SETTINGS)).toBe(true);
    expect(
      teachingInputHelpersEnabled({
        ...DEFAULT_SETTINGS,
        showTeachingInputHelpers: undefined,
      }),
    ).toBe(true);
  });

  it("hides helpers only when Teaching is active and setting is false", () => {
    const off = { ...DEFAULT_SETTINGS, showTeachingInputHelpers: false };
    expect(teachingHidesInputHelpers(false, off)).toBe(false);
    expect(teachingHidesInputHelpers(true, DEFAULT_SETTINGS)).toBe(false);
    expect(teachingHidesInputHelpers(true, off)).toBe(true);
  });

  it("does not suppress language suggestions when helpers are on", () => {
    expect(
      shouldSuppressLanguageSuggestions(true, DEFAULT_SETTINGS),
    ).toBe(false);
    expect(
      shouldSuppressLanguageSuggestions(true, {
        ...DEFAULT_SETTINGS,
        showTeachingInputHelpers: false,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLanguageSuggestions(false, {
        ...DEFAULT_SETTINGS,
        showTeachingInputHelpers: false,
      }),
    ).toBe(false);
  });

  it("hides dictation key when Teaching helpers are off", () => {
    expect(isDictationKeyVisible(DEFAULT_SETTINGS, true)).toBe(true);
    expect(
      isDictationKeyVisible(
        { ...DEFAULT_SETTINGS, dictationVisible: false },
        true,
      ),
    ).toBe(false);
    expect(
      isDictationKeyVisible(
        { ...DEFAULT_SETTINGS, showTeachingInputHelpers: false },
        true,
      ),
    ).toBe(false);
    expect(
      isDictationKeyVisible(
        { ...DEFAULT_SETTINGS, showTeachingInputHelpers: false },
        false,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/teachingInputHelpers.test.ts`

Expected: FAIL (module / exports missing)

- [ ] **Step 3: Add schema defaults**

In `src/lib/types.ts`, on `AppSettings` (near `dictationVisible`):

```ts
  /**
   * When false, hide suggestions, mic, and live input preview while Teaching is active.
   * Default true.
   */
  showTeachingInputHelpers?: boolean;
```

In `DEFAULT_SETTINGS`:

```ts
  showTeachingInputHelpers: true,
```

In `src/stores/storeShared.ts` `legacyFill`:

```ts
      showTeachingInputHelpers: parsed.showTeachingInputHelpers ?? true,
```

In `src-tauri/src/db/mod.rs` seed JSON (alongside `dictationVisible`):

```json
"showTeachingInputHelpers": true,
```

- [ ] **Step 4: Implement pure helpers**

Create `src/lib/teachingInputHelpers.ts`:

```ts
import type { AppSettings } from "./types";

export function teachingInputHelpersEnabled(settings: AppSettings): boolean {
  return settings.showTeachingInputHelpers !== false;
}

export function teachingHidesInputHelpers(
  teachingSessionActive: boolean,
  settings: AppSettings,
): boolean {
  return teachingSessionActive && !teachingInputHelpersEnabled(settings);
}

export function shouldSuppressLanguageSuggestions(
  languageLessonActive: boolean,
  settings: AppSettings,
): boolean {
  return languageLessonActive && !teachingInputHelpersEnabled(settings);
}

export function isDictationKeyVisible(
  settings: AppSettings,
  teachingSessionActive: boolean,
): boolean {
  if (!settings.dictationVisible) return false;
  if (teachingHidesInputHelpers(teachingSessionActive, settings)) return false;
  return true;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/teachingInputHelpers.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/teachingInputHelpers.ts src/lib/teachingInputHelpers.test.ts src/stores/storeShared.ts src-tauri/src/db/mod.rs
git commit -m "$(cat <<'EOF'
feat: add showTeachingInputHelpers setting and visibility gates

EOF
)"
```

On Windows PowerShell, use the repo’s usual commit style (here-string) instead of bash heredoc if needed.

---

### Task 2: Wire KeyboardSection preview + suggestions

**Files:**
- Modify: `src/components/keyboard/KeyboardSection.tsx`

**Interfaces:**
- Consumes: `teachingHidesInputHelpers`, `shouldSuppressLanguageSuggestions` from `../../lib/teachingInputHelpers`; existing `isTeachingSessionActive`
- Produces: no new exports

- [ ] **Step 1: Update visibility expressions**

Replace the hard Teaching hide. After `teachingSessionActive` is computed:

```tsx
  const helpersHidden = teachingHidesInputHelpers(
    teachingSessionActive,
    settings,
  );
```

Change `showInputPreview` to:

```tsx
  const showInputPreview =
    !showSynth &&
    !compact &&
    !helpersHidden &&
    !companionSessionLive &&
    isInputPreviewActiveForMode(settings, focusModeActive);
```

Change `showSuggestions` to:

```tsx
  const showSuggestions =
    !showSynth &&
    settings.suggestionsVisible &&
    !compact &&
    !helpersHidden &&
    !shouldSuppressLanguageSuggestions(languageLessonActive, settings);
```

Remove uses of bare `!teachingSessionActive` on those two flags. Keep `languageLessonActive` computation before `showSuggestions`.

Import the helpers at the top of the file.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/keyboard/KeyboardSection.tsx
git commit -m "$(cat <<'EOF'
feat: gate Teaching preview and suggestions with helpers setting

EOF
)"
```

---

### Task 3: Wire Keyboard mic visibility + stop on hide

**Files:**
- Modify: `src/components/keyboard/Keyboard.tsx`

**Interfaces:**
- Consumes: `isDictationKeyVisible`, `isTeachingSessionActive` (or pass teaching session from existing store fields already in `Keyboard`)
- Produces: no new exports

- [ ] **Step 1: Compute teaching session + dictation visibility**

`Keyboard.tsx` already has `musicTeachingEnabled`, `settings`, `dictationState`, `stopDictation`. Import:

```ts
import { isTeachingSessionActive } from "../../lib/appModeLayout";
import { isDictationKeyVisible } from "../../lib/teachingInputHelpers";
```

Near the rows `useMemo`, replace `settings.dictationVisible` gating with:

```tsx
  const teachingSessionActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  const dictationKeyVisible = isDictationKeyVisible(
    settings,
    teachingSessionActive,
  );
```

```tsx
  const rows = useMemo<KeyDef[][]>(() => {
    if (dictationKeyVisible) return baseRows;
    return baseRows.map((row) => row.filter((k) => k.key !== "dictate"));
  }, [baseRows, dictationKeyVisible]);
```

- [ ] **Step 2: Stop dictation when Teaching helpers hide the mic**

Replace the existing effect:

```tsx
  useEffect((): void => {
    if (!settings.dictationVisible && dictationState !== "idle") {
      void stopDictation();
    }
  }, [settings.dictationVisible, dictationState, stopDictation]);
```

with:

```tsx
  useEffect((): void => {
    if (!dictationKeyVisible && dictationState !== "idle") {
      void stopDictation();
    }
  }, [dictationKeyVisible, dictationState, stopDictation]);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/keyboard/Keyboard.tsx
git commit -m "$(cat <<'EOF'
feat: hide Teaching mic with helpers setting and stop dictation

EOF
)"
```

---

### Task 4: ModesSection toggle + i18n

**Files:**
- Modify: `src/components/settings/ModesSection.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/el.ts`, `src/i18n/de.ts`, `src/i18n/fr.ts`, `src/i18n/es.ts`, `src/i18n/it.ts`, `src/i18n/pt.ts`

**Interfaces:**
- Consumes: existing `ToggleRow`, `updateSettings`, `settings.showTeachingInputHelpers`
- Produces: i18n keys `showTeachingInputHelpers`, `showTeachingInputHelpersDescription`

- [ ] **Step 1: Add English strings**

In `src/i18n/en.ts` (near other mode / visible-section strings):

```ts
  showTeachingInputHelpers: "Show input helpers in Teaching mode",
  showTeachingInputHelpersDescription:
    "Suggestions bar, mic, and live input preview while Teaching is active.",
```

Add the same keys to `el`, `de`, `fr`, `es`, `it`, `pt` (English copy is acceptable if no translation yet; prefer short natural translations when obvious).

- [ ] **Step 2: Insert toggle under mode tablets**

In `ModesSection.tsx`, immediately after the closing `</div>` of the `grid grid-cols-5` mode tablets (before `{selectedMode === "teaching" && (` lesson chips), insert:

```tsx
      <div className="mt-3">
        <ToggleRow
          label={t("showTeachingInputHelpers")}
          checked={settings.showTeachingInputHelpers !== false}
          onChange={(checked) =>
            updateSettings({ showTeachingInputHelpers: checked })
          }
          surface={surface}
        />
        <p
          className="mt-1 px-1 text-xs"
          style={{ color: surface.panelMutedText }}
        >
          {t("showTeachingInputHelpersDescription")}
        </p>
      </div>
```

Mirror the Focus transparent hint spacing pattern already in this file.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS (`TranslationKey` picks up new keys from `en.ts`)

- [ ] **Step 4: Commit (end of feature commit 1 logical unit)**

If Tasks 1–3 were already committed separately, this commit finishes the Settings UI. If the implementer preferred fewer commits, squash Tasks 1–4 into one feature commit titled:

```bash
git add src/components/settings/ModesSection.tsx src/i18n/*.ts
git commit -m "$(cat <<'EOF'
feat: Settings toggle for Teaching input helpers (#262)

EOF
)"
```

**Packaging note:** Spec wants helpers as commit 1 vs animated switch as commit 2. Prefer one squash commit for Tasks 1–4 before starting Task 5, or keep the intermediate commits and treat “commit 1” as the helpers series.

---

### Task 5: AnimatedToggle + ToggleRow (commit 2)

**Files:**
- Create: `src/components/settings/AnimatedToggle.tsx`
- Create: `src/components/settings/AnimatedToggle.test.tsx`
- Modify: `src/components/settings/settingsControls.tsx`

**Interfaces:**
- Consumes: `SurfaceColors` from `../../lib/colorProfiles`
- Produces: `AnimatedToggle` props `{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; surface: SurfaceColors; id?: string }`

- [ ] **Step 1: Write the failing component test**

Create `src/components/settings/AnimatedToggle.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnimatedToggle } from "./AnimatedToggle";
import { getSurfaceColors } from "../../lib/colorProfiles";

const surface = getSurfaceColors("#e5e7eb");

describe("AnimatedToggle", () => {
  it("exposes switch role and toggles on click", () => {
    const onChange = vi.fn();
    render(
      <AnimatedToggle checked={false} onChange={onChange} surface={surface} />,
    );
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(
      <AnimatedToggle
        checked={false}
        onChange={onChange}
        disabled
        surface={surface}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

(If `@testing-library/react` import paths differ in this repo, match an existing `*.test.tsx` such as `CollapsedFab.test.tsx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/settings/AnimatedToggle.test.tsx`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement AnimatedToggle**

Create `src/components/settings/AnimatedToggle.tsx`:

```tsx
import type { JSX } from "react";
import type { SurfaceColors } from "../../lib/colorProfiles";

type AnimatedToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  surface: SurfaceColors;
  disabled?: boolean;
  id?: string;
};

export function AnimatedToggle({
  checked,
  onChange,
  surface,
  disabled = false,
  id,
}: AnimatedToggleProps): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out motion-reduce:transition-none ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
      style={{
        backgroundColor: checked ? surface.panelText : surface.insetBorder,
      }}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out motion-reduce:transition-none ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
```

Adjust colors if white thumb fails contrast on a specific profile; keep track from `SurfaceColors` only.

- [ ] **Step 4: Wire ToggleRow**

In `src/components/settings/settingsControls.tsx`, import `AnimatedToggle` and replace the `<input type="checkbox" … />` with:

```tsx
      <AnimatedToggle
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        surface={surface}
      />
```

Keep the outer `<label>` wrapping label text + switch. Ensure clicking the label still toggles: either nest the button carefully (prefer `htmlFor` + `id` on the switch) or keep label `onClick` / associate via `id`.

Preferred accessibility pattern — change `ToggleRow` to:

```tsx
export const ToggleRow = ({
  label,
  checked,
  onChange,
  surface,
  disabled = false,
}: ToggleRowProps): JSX.Element => {
  const switchId = `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${disabled ? "opacity-60" : ""}`}
      style={{ backgroundColor: surface.insetBg }}
    >
      <label
        htmlFor={switchId}
        className={`text-sm ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        style={{ color: surface.panelText }}
      >
        {label}
      </label>
      <AnimatedToggle
        id={switchId}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        surface={surface}
      />
    </div>
  );
};
```

Note: clicking `<label htmlFor>` activates a `<button>` inconsistently in some browsers. Safer approach: keep a single clickable row:

```tsx
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={undefined}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      style={{ backgroundColor: surface.insetBg }}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span className="text-sm" style={{ color: surface.panelText }}>
        {label}
      </span>
      <AnimatedToggle
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        surface={surface}
      />
    </button>
  );
```

**Do not nest interactive button inside button.** Use the non-nested pattern: row is a `div`/`label`; only `AnimatedToggle` is the control; label text uses `htmlFor` only if the control is an `input`. For a `button` switch, make the **row** the click target and pass clicks to `onChange`, and make `AnimatedToggle` a non-button visual with `role="switch"` on the row — **or** keep row as `label` + checkbox-styled switch that is a `button` and stop label default by not wrapping.

**Chosen pattern for this plan:** row `div`; label `span`; `AnimatedToggle` is the only interactive element; entire row clickable via:

```tsx
    <div
      role="presentation"
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${disabled ? "opacity-60" : ""}`}
      style={{ backgroundColor: surface.insetBg }}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span className="text-sm" style={{ color: surface.panelText }}>
        {label}
      </span>
      <AnimatedToggle
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        surface={surface}
      />
    </div>
```

And in `AnimatedToggle` `onClick`, call `e.stopPropagation()` before `onChange` so the row handler does not double-fire:

```tsx
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onChange(!checked);
      }}
```

- [ ] **Step 5: Run AnimatedToggle tests + typecheck**

Run:

```bash
npm test -- src/components/settings/AnimatedToggle.test.tsx
npm run typecheck
```

Expected: PASS

- [ ] **Step 6: Commit (commit 2)**

```bash
git add src/components/settings/AnimatedToggle.tsx src/components/settings/AnimatedToggle.test.tsx src/components/settings/settingsControls.tsx
git commit -m "$(cat <<'EOF'
feat: replace Settings checkboxes with animated toggle

EOF
)"
```

---

### Task 6: Verification pass

**Files:** none new (manual + automated)

- [ ] **Step 1: Run gate + toggle tests**

```bash
npm test -- src/lib/teachingInputHelpers.test.ts src/components/settings/AnimatedToggle.test.tsx
npm run typecheck
```

Expected: PASS

- [ ] **Step 2: Manual QA checklist**

- [ ] Settings → Mode: toggle appears under the 5 tablets in every selected mode
- [ ] Teaching + helpers on + compact off + suggestions/preview/dictation Visible Sections on → all three show (including language spelling suggestions chips)
- [ ] Toggle helpers off while Teaching → all three gone, no empty gaps; dictation stops if listening
- [ ] Normal / Focus / Mini unchanged by the Teaching helpers setting
- [ ] Restart app → helpers setting persists
- [ ] Companion / tablet snapshot does not need the new key (no companion plumbing added)
- [ ] All Settings boolean rows use the animated switch

- [ ] **Step 3: No further commit unless QA fixes are needed**

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| `showTeachingInputHelpers` default true, persisted | Task 1 |
| Teaching-only group hide/show of three chrome pieces | Tasks 2–3 |
| Replace #167 hard hide; compact/synth still win | Task 2 |
| Spelling suggestions allowed when helpers on | Task 1 + 2 (`shouldSuppressLanguageSuggestions`) |
| Toggle under mode tablets always | Task 4 |
| Hint copy | Task 4 |
| Mic stop on hide | Task 3 |
| Companion ignores | Global constraints + no companion file changes |
| Animated switch commit 2 | Task 5 |
| Acceptance / manual QA | Task 6 |

No placeholders left in steps. Names consistent: `showTeachingInputHelpers`, `teachingHidesInputHelpers`, `isDictationKeyVisible`, `AnimatedToggle`.
