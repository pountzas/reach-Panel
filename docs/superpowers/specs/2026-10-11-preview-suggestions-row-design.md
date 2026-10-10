# Preview + suggestions side-by-side row — Design Spec

**Date:** 2026-10-11  
**Status:** Approved for implementation  
**Issue:** [#201](https://github.com/pountzas/reach-Panel/issues/201)  
**Scope:** Frontend only — place suggestions to the right of the live preview, center the pair, animate show/hide (including last chips while collapsing)

## 1. Goals

- When live preview is enabled and suggestion chips are present, show them on **one horizontal row**: preview left, chips right, **pair centered**.
- Animate appear/disappear of either slot so the remaining item glides to center (no jump).
- Keep last suggestion chips visible during the hide animation (option B).
- Honor `prefers-reduced-motion` (instant, no transition).
- Apply in **Normal** and **Focus** toolbars (keyboard visible). Appearing/disappearing chips must not change keyboard key height when the toolbar already reserves preview height.

## 2. Non-goals

- Changing when preview or suggestions are allowed (teaching, compact, synth, language lesson, Focus collapse gates stay as today)
- Changing `showToolbar` visibility logic
- Companion / Android keyboard layout
- Measuring DOM widths in JS for centering

## 3. Context

Builds on [#200](https://github.com/pountzas/reach-Panel/issues/200) / PR #216: preview slot can stay blank when no editable field is focused. That work is already on `main`.

Today (`KeyboardSection.tsx`):

- Preview and `SuggestionsBar` stack vertically in Normal (`flex-col`) and Focus (second toolbar row).
- Items mount/unmount with `{show ? <X/> : null}` — no transitions.
- `auxCenterMinHeightPx` **sums** preview (48) + chips (32) + gap (8).
- Focus toolbar uses `focusModeToolbarClassName(hasSuggestionChips)`, which adds `gap-1` for the second row.
- `InputPreview` max width is 320px; chips are ~32px tall. `SuggestionsBar` returns `null` when `suggestions.length === 0`.

Issue text still says “Mini Mode” / `miniMode.ts`; code was renamed to Focus mode (`focusMode.ts`).

## 4. Decision

**Always-mounted animated slots in a new `PreviewSuggestionsRow`, centered with flex.**  
Hidden slots collapse via `max-width` / opacity / transform so `justify-center` recenters the visible item. Last chips are held in a ref for the hide animation.

| Topic | Choice |
| --- | --- |
| Layout | Single row, `justify-center` |
| Animation | Tailwind `transition-[max-width,opacity,transform,margin] duration-300 ease-out motion-reduce:transition-none` |
| Preview slot | Always mounted; `width: 320`; `max-w-[320px]` ↔ `max-w-0`; slight `-translate-x` when hiding |
| Suggestions slot | Always mounted; `max-w-[min(60vw,40rem)]` ↔ `max-w-0`; slight `translate-x` when hiding; `ml-2` only when both shown |
| Last chips | `useRef<string[]>`; update when store suggestions non-empty; pass override into `SuggestionsBar` while collapsing |
| Hit testing / a11y | Hidden slots: `aria-hidden` + `pointer-events-none` |
| Height | `auxCenterMinHeightPx` = max of the two strips (48 if preview, else 32 if chips, else 0) — not sum |
| Focus toolbar | Drop chip-driven `gap-1` (no second row); keep function signature |

## 5. Components

### 5.1 `PreviewSuggestionsRow`

**Path:** `src/components/keyboard/PreviewSuggestionsRow.tsx`

**Props:** `{ showPreview: boolean; showSuggestions: boolean }`

**Behavior:**

1. Outer: `flex w-full min-w-0 items-center justify-center`.
2. Preview wrapper always mounted; contains `<InputPreview />`.
3. Suggestions wrapper always mounted; contains `<SuggestionsBar suggestions={displaySuggestions} />` (or equivalent override prop).
4. `lastSuggestionsRef`: when store `suggestions.length > 0`, copy into the ref. Effective list for the bar = `suggestions.length > 0 ? suggestions : lastSuggestionsRef.current`. When both are empty (never had chips), the bar renders nothing inside the (already zero-width) slot.
5. Gap: `ml-2` on suggestions wrapper only when `showPreview && showSuggestions`.

### 5.2 `SuggestionsBar`

**Path:** `src/components/common/SuggestionsBar.tsx`

- Add optional `suggestions?: string[]`.
- If provided, render that list; otherwise read from the store (current behavior).
- Styling / click / transparent UI unchanged.

### 5.3 `KeyboardSection`

**Path:** `src/components/keyboard/KeyboardSection.tsx`

- Focus toolbar: replace center `{showInputPreview ? <InputPreview /> : null}` with `<PreviewSuggestionsRow … />`; remove second-row `{suggestionsRow}`.
- Normal toolbar: replace stacked preview + `suggestionsRow` with the same row; center column `items-center justify-center` (not `flex-col`).
- Delete unused `suggestionsRow` and `SUGGESTION_ROW_MIN_CLASS` if unused.
- Update `auxCenterMinHeightPx` per §4.
- Keep existing `showInputPreview` / `showSuggestions` / `hasSuggestionChips` / `showToolbar` gates.

### 5.4 `focusModeToolbarClassName`

**Path:** `src/lib/focusMode.ts`

- Stop adding `gap-1` when `hasSuggestionChips` is true (second row gone).
- Keep `(hasSuggestionChips: boolean)` parameter so callers need not change.
- Update `focusMode.test.ts` accordingly.

## 6. Testing

**New:** `src/components/keyboard/PreviewSuggestionsRow.test.tsx` (Vitest + Testing Library, same style as `KeyButton.test.tsx`):

- Preview wrapper has `max-w-0` when `showPreview=false`.
- Suggestions wrapper has `ml-2` only when both shown.
- Both wrappers stay mounted when hidden.
- After store had chips and `showSuggestions` becomes false, last chips still appear inside the suggestions slot (option B).

**Update:** `src/lib/focusMode.test.ts` — no longer expect `gap-1` for chips.

**Verify:** `npm test`, `npm run build`.

## 7. Acceptance criteria

- [ ] Preview + chips: same row, chips to the right, pair centered (Normal + Focus).
- [ ] Chips appear: fade/slide in; preview glides left; no jump.
- [ ] Chips disappear: animate out with last chips still visible during collapse; preview recenters.
- [ ] Preview toggled off/on: animates; chips recenter / make room.
- [ ] Chip show/hide does not change keyboard key height (stable toolbar min height when preview already shown).
- [ ] `prefers-reduced-motion: reduce` → instant change.
- [ ] Teaching, compact, synth hide preview/suggestions as before.
- [ ] `npm test` and `npm run build` pass.

## 8. Implementation order

1. Extend `SuggestionsBar` with optional override + tests if needed.
2. Add `PreviewSuggestionsRow` + unit tests (TDD).
3. Wire `KeyboardSection`; adjust height and Focus toolbar class.
4. Update `focusMode` helper/tests.
5. Full `npm test` + `npm run build`.
