# Preview + suggestions side-by-side row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place suggestion chips to the right of the live preview on one centered row, with smooth show/hide animation and last chips retained during collapse (#201).

**Architecture:** New `PreviewSuggestionsRow` always mounts preview and suggestions wrappers; Tailwind animates `max-width` / opacity / transform so `justify-center` recenters the visible item. Optional `suggestions` override on `SuggestionsBar` plus a ref in the row keep last chips during hide. Wire into Normal and Focus toolbars; drop stacked second row and sum-based min height.

**Tech Stack:** React 19 + TypeScript, Tailwind v4, Zustand `useAppStore`, Vitest + Testing Library, Windows-only ReachPanel frontend.

## Global Constraints

- Windows-only product; do not add macOS/Linux paths.
- Frontend only — no Rust / Tauri changes.
- Do not change teaching / compact / synth / language-lesson visibility gates or `showToolbar` logic.
- Spec: `docs/superpowers/specs/2026-10-11-preview-suggestions-row-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/201
- Focus mode naming (`focusMode.ts`), not Mini Mode / `miniMode.ts`.

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/components/common/SuggestionsBar.tsx` | Optional `suggestions?: string[]` override |
| `src/components/keyboard/PreviewSuggestionsRow.tsx` | Centered animated preview + chips row |
| `src/components/keyboard/PreviewSuggestionsRow.test.tsx` | Slot classes, mount, last chips, margin |
| `src/components/keyboard/KeyboardSection.tsx` | Use row in both toolbars; height = max not sum |
| `src/lib/focusMode.ts` | Drop chip-row `gap-1` |
| `src/lib/focusMode.test.ts` | Assert no chip gap |

---

### Task 1: Optional suggestions override on `SuggestionsBar`

**Files:**
- Modify: `src/components/common/SuggestionsBar.tsx`
- Test: `src/components/keyboard/PreviewSuggestionsRow.test.tsx` (covered in Task 2; no separate SuggestionsBar test required)

**Interfaces:**
- Consumes: store `suggestions` when prop omitted
- Produces: `export function SuggestionsBar({ suggestions?: string[] }: { suggestions?: string[] })`

- [ ] **Step 1: Write failing test that will need override (Task 2 RED includes this)**

Skip a standalone SuggestionsBar test file. Task 2’s last-chips test fails until override exists; implement override in Task 2 Step 3 if not already done, or do it here first:

- [ ] **Step 2: Add optional prop**

Replace the component signature and list source in `SuggestionsBar.tsx`:

```tsx
export function SuggestionsBar({
  suggestions: suggestionsProp,
}: {
  suggestions?: string[];
} = {}) {
  const storeSuggestions = useAppStore((s) => s.suggestions);
  const suggestions = suggestionsProp ?? storeSuggestions;
  // ... rest unchanged; early return still uses `suggestions.length === 0`
```

Keep `applySuggestion`, transparent styling, and chip markup unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/SuggestionsBar.tsx
git commit -m "feat: allow SuggestionsBar to render an override list"
```

---

### Task 2: `PreviewSuggestionsRow` + unit tests (TDD)

**Files:**
- Create: `src/components/keyboard/PreviewSuggestionsRow.tsx`
- Create: `src/components/keyboard/PreviewSuggestionsRow.test.tsx`

**Interfaces:**
- Consumes: `InputPreview`, `SuggestionsBar({ suggestions? })`, `useAppStore` for suggestions
- Produces: `export function PreviewSuggestionsRow({ showPreview, showSuggestions }: { showPreview: boolean; showSuggestions: boolean })`

- [ ] **Step 1: Write failing tests**

Create `src/components/keyboard/PreviewSuggestionsRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const storeState = {
  settings: { ...DEFAULT_SETTINGS, uiLanguage: "en" as const },
  focusModeActive: false,
  inputPreviewFrame: null as string | null,
  externalInputFocused: false,
  suggestions: [] as string[],
  applySuggestion: vi.fn(),
};

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { PreviewSuggestionsRow } from "./PreviewSuggestionsRow";

describe("PreviewSuggestionsRow", () => {
  beforeEach(() => {
    storeState.suggestions = [];
    storeState.externalInputFocused = false;
    storeState.inputPreviewFrame = null;
    storeState.focusModeActive = false;
  });

  it("collapses the preview slot with max-w-0 when showPreview is false", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    const previewSlot = container.querySelector("[data-slot='preview']");
    expect(previewSlot).toBeTruthy();
    expect(previewSlot!.className.split(/\s+/)).toContain("max-w-0");
  });

  it("adds ml-2 on the suggestions slot only when both are shown", () => {
    storeState.suggestions = ["hello"];
    const both = render(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={true} />,
    );
    const bothSlot = both.container.querySelector("[data-slot='suggestions']");
    expect(bothSlot!.className.split(/\s+/)).toContain("ml-2");
    both.unmount();

    const chipsOnly = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={true} />,
    );
    const chipsSlot = chipsOnly.container.querySelector(
      "[data-slot='suggestions']",
    );
    expect(chipsSlot!.className.split(/\s+/)).not.toContain("ml-2");
  });

  it("keeps both slots mounted when hidden", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    expect(container.querySelector("[data-slot='preview']")).toBeTruthy();
    expect(container.querySelector("[data-slot='suggestions']")).toBeTruthy();
  });

  it("keeps last chips visible while the suggestions slot is hiding", () => {
    storeState.suggestions = ["alpha", "beta"];
    const { rerender } = render(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={true} />,
    );
    expect(screen.getByRole("button", { name: "alpha" })).toBeTruthy();

    storeState.suggestions = [];
    rerender(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={false} />,
    );
    expect(screen.getByRole("button", { name: "alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "beta" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests expecting RED**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/components/keyboard/PreviewSuggestionsRow.test.tsx --expect red
```

Expected: `status: fail` (module or assertions missing), not `error` from bad test setup.

- [ ] **Step 3: Minimal implementation**

Create `src/components/keyboard/PreviewSuggestionsRow.tsx`:

```tsx
import { useRef } from "react";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { useAppStore } from "../../stores/appStore";
import { InputPreview } from "./InputPreview";

const SLOT_ANIM =
  "overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-out motion-reduce:transition-none";

const PREVIEW_WIDTH = 320;

export function PreviewSuggestionsRow({
  showPreview,
  showSuggestions,
}: {
  showPreview: boolean;
  showSuggestions: boolean;
}) {
  const suggestions = useAppStore((s) => s.suggestions);
  const lastSuggestionsRef = useRef<string[]>([]);
  if (suggestions.length > 0) {
    lastSuggestionsRef.current = suggestions;
  }
  const displaySuggestions =
    suggestions.length > 0 ? suggestions : lastSuggestionsRef.current;

  return (
    <div className="flex w-full min-w-0 items-center justify-center">
      <div
        data-slot="preview"
        aria-hidden={!showPreview}
        className={`${SLOT_ANIM} shrink-0 ${
          showPreview
            ? "max-w-[320px] opacity-100 translate-x-0"
            : "pointer-events-none max-w-0 opacity-0 -translate-x-2"
        }`}
        style={{ width: PREVIEW_WIDTH }}
      >
        <InputPreview />
      </div>
      <div
        data-slot="suggestions"
        aria-hidden={!showSuggestions}
        className={`${SLOT_ANIM} min-w-0 ${
          showSuggestions
            ? "max-w-[min(60vw,40rem)] opacity-100 translate-x-0"
            : "pointer-events-none max-w-0 opacity-0 translate-x-2"
        } ${showPreview && showSuggestions ? "ml-2" : "ml-0"}`}
      >
        <SuggestionsBar suggestions={displaySuggestions} />
      </div>
    </div>
  );
}
```

If Task 1 was skipped, add the `suggestions` override to `SuggestionsBar` in this step.

- [ ] **Step 4: Run tests expecting GREEN**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/components/keyboard/PreviewSuggestionsRow.test.tsx --expect green
```

Expected: `status: pass`

- [ ] **Step 5: Commit**

```bash
git add src/components/keyboard/PreviewSuggestionsRow.tsx src/components/keyboard/PreviewSuggestionsRow.test.tsx src/components/common/SuggestionsBar.tsx
git commit -m "feat: add animated PreviewSuggestionsRow with last-chip hide"
```

---

### Task 3: Wire `KeyboardSection` + Focus toolbar height

**Files:**
- Modify: `src/components/keyboard/KeyboardSection.tsx`
- Modify: `src/lib/focusMode.ts`
- Modify: `src/lib/focusMode.test.ts`

**Interfaces:**
- Consumes: `PreviewSuggestionsRow({ showPreview, showSuggestions })`
- Produces: no new exports

- [ ] **Step 1: Update Focus toolbar class helper**

In `src/lib/focusMode.ts`, replace `focusModeToolbarClassName` with:

```ts
export function focusModeToolbarClassName(_hasSuggestionChips: boolean): string {
  return [
    "relative z-20 flex w-full shrink-0 flex-col overflow-visible",
    "pl-3 pr-1 pt-1 pb-0",
  ].join(" ");
}
```

In `src/lib/focusMode.test.ts`, replace the chip-gap test:

```ts
  it("does not add a second-row gap when suggestion chips are present", () => {
    expect(focusModeToolbarClassName(true).split(/\s+/)).not.toContain("gap-1");
  });
```

- [ ] **Step 2: Wire KeyboardSection**

1. Replace imports: remove direct `SuggestionsBar` if unused; add `PreviewSuggestionsRow`.
2. Delete `SUGGESTION_ROW_MIN_CLASS` and the `suggestionsRow` constant.
3. Replace height with:

```ts
  const auxCenterMinHeightPx = showInputPreview
    ? INPUT_PREVIEW_STRIP_HEIGHT_PX
    : hasSuggestionChips
      ? 32
      : 0;
```

4. Focus toolbar center (replace preview-only block + remove `{suggestionsRow}`):

```tsx
              <div
                className={`flex min-w-0 flex-1 items-center justify-center px-1 ${showInputPreview || hasSuggestionChips ? "min-h-[48px]" : ""}`}
              >
                <PreviewSuggestionsRow
                  showPreview={showInputPreview}
                  showSuggestions={hasSuggestionChips}
                />
              </div>
              {endControls}
            </div>
```

(Remove the second-row `{suggestionsRow}` entirely.)

5. Normal toolbar center column:

```tsx
            <div
              className="flex min-w-0 items-center justify-center overflow-hidden px-1"
              style={
                auxCenterMinHeightPx > 0
                  ? { minHeight: auxCenterMinHeightPx }
                  : undefined
              }
            >
              <PreviewSuggestionsRow
                showPreview={showInputPreview}
                showSuggestions={hasSuggestionChips}
              />
            </div>
```

- [ ] **Step 3: Run focused + full verification**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/lib/focusMode.test.ts --expect green
npm test
npm run build
```

Expected: all pass / build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/keyboard/KeyboardSection.tsx src/lib/focusMode.ts src/lib/focusMode.test.ts
git commit -m "feat: center preview and suggestions on one animated toolbar row"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Side-by-side centered row | 2, 3 |
| Animate show/hide + reduced motion | 2 |
| Last chips during hide | 2 |
| Normal + Focus wiring | 3 |
| Height max not sum; no key shrink | 3 |
| Drop Focus second-row gap | 3 |
| Gates unchanged | 3 (no gate edits) |
| Tests + npm test/build | 2, 3 |
