# Settings: adjustable keyboard button font size — Design Spec

**Date:** 2026-10-12  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/228  
**Scope:** Windows app Settings slider for keyboard (and numpad) label font size; special-key label layout; Modes section reorder. Tablet companion unchanged.

## 1. Goals

- Settings exposes a “Keyboard font size” slider that changes on-screen keyboard button label size.
- Default remains today’s size (**18px**) so existing users see no change.
- Value persists in the app profile store and survives restart.
- Slider updates labels immediately (no restart).
- Max size fills the key height with **4px** total vertical padding (2px top + 2px bottom).
- Backspace, Enter, and Shift labels sit icon + word **side by side** so they can grow with the slider.
- Modes section appears **first** in Settings (above Profile).

## 2. Non-goals

- Tablet companion control or sync of this setting.
- Scaling synthesizer / piano key labels with this setting.
- Changing key box geometry (`computeKeyMetrics`); only label `fontSize` changes.
- Percentage-of-default as the persisted unit (UI may show px; storage stays px).

## 3. Context

- `AppSettings.keyboardFontSize` already exists (optional number; default **18** in `DEFAULT_SETTINGS` and Rust DB defaults).
- Consumers today: `Keyboard.tsx`, `NumKeypad.tsx`, `Synthesizer.tsx` — all read `settings.keyboardFontSize`.
- Key height comes from `computeKeyMetrics(containerHeight, rowCount)` in `src/lib/keyMetrics.ts` (floor 28px).
- Special labels: `SPECIAL_KEY_LABELS` in `src/lib/keyboardLayouts.ts`; Space already uses `layout: "row"`; Backspace / Enter / Shift use `"stack"`.
- Settings range pattern: Appearance opacity / background opacity in `SettingsPanel.tsx`.
- Companion sync is a subset (`sanitize_settings_for_tablet`); `keyboardFontSize` is not included. Tablet keyboard hardcodes 18px.

## 4. Decision

**Approach 1 — store absolute px; clamp to live key height.**

| Decision | Choice |
| --- | --- |
| Persistence | Existing `keyboardFontSize` (px) |
| Default | 18 |
| Min | 14 (≈80% of 18) |
| Slider max (Settings) | Fixed **29** (≈160% of 18); Settings runs in a separate webview and cannot read live key height |
| Render max | `min(29, max(14, keyHeight - 4))` via `maxKeyboardFontSize` |
| Effective render size | `min(clampKeyboardFontSize(stored), maxKeyboardFontSize(keyHeight))` |
| Slider thumb | `clampKeyboardFontSize(stored)` (14–29) |
| Keyboard + numpad | Share the setting |
| Synthesizer | Fixed sizes; stop reading `keyboardFontSize` |
| Companion | Unchanged |
| Special keys | Backspace / Enter / Shift → `layout: "row"` |
| Settings order | Modes section moved to top of scroll content |

## 5. Architecture

### Helper (`src/lib/keyboardFontSize.ts`)

Pure functions, unit-tested:

- `KEYBOARD_FONT_SIZE_DEFAULT = 18`
- `KEYBOARD_FONT_SIZE_MIN = 14`
- `KEYBOARD_FONT_SIZE_MAX = 29`
- `KEYBOARD_FONT_SIZE_PADDING_PX = 4`
- `clampKeyboardFontSize(stored)` — Settings slider range
- `maxKeyboardFontSize(keyHeight)` — height clamp capped at 29
- `effectiveKeyboardFontSize(stored, keyHeight)` — render path

### Keyboard

- Keep computing `keyHeight` via `computeKeyMetrics`.
- Pass `effectiveKeyboardFontSize(settings.keyboardFontSize, keyHeight)` into `KeyButton` / `SpecialKeyLabel` / language labels.
- Do **not** publish key height into the Zustand store for Settings (separate Tauri webview / JS context).

### NumKeypad

- Continue using `keyboardFontSize`. Compute numpad button height from the numpad container (same idea as keyboard metrics) and pass that into `effectiveKeyboardFontSize` so clamp rules match. Do not invent a second stored setting.

### Synthesizer

- Replace `settings.keyboardFontSize` reads with fixed constants matching today’s fallbacks (e.g. 14 for main labels, `18 * 0.55` for secondary), so the Settings slider does not move synth text.

### SpecialKeyLabel / layouts

- `backspace` / `enter` / `shift` / `space` all use `layout: "row"` (icon + word side by side) so labels can grow with the slider.
- Space keeps its original symbol/word sizing (`1.2×` / `0.72×`, bottom-aligned).
- Row layouts use `overflow-hidden` / `truncate` / `whitespace-nowrap` so wide labels do not spill.

### Settings UI

- Appearance section: range input after the pattern of opacity, labeled via i18n (`keyboardFontSize`), value shown as **px** next to the label.
- `min={14}`, `max={29}`, `step={1}`, `value={clampKeyboardFontSize(...)}`, `onChange` → `updateSettings({ keyboardFontSize: Number(...) })`.
- Fixed slider range (issue #228 80%–160%); keyboard/numpad still height-clamp at render.

### Settings section order

Current scroll order starts Profile → Accessibility → Taskbar → **Modes** → Appearance → …

**New order:** **Modes** → Profile → Accessibility → Taskbar → Appearance → … (move the existing `modesSection` block only; no behavior change).

### i18n

- Add `keyboardFontSize` (and any short hint if needed) to all `src/i18n/*.ts` locale files.

## 6. Data flow

```text
Settings slider
  → updateSettings({ keyboardFontSize: px })
  → appStore + profile persist (existing path)

Keyboard render
  → keyHeight = computeKeyMetrics(...).keyHeight
  → fontSize = effectiveKeyboardFontSize(settings.keyboardFontSize, keyHeight)
  → KeyButton / SpecialKeyLabel

NumKeypad render
  → same stored setting + effective clamp helper

Window / mode resize (shorter keys)
  → max shrinks; render clamps; stored px unchanged
  → enlarging keys again restores full stored size
```

## 7. Edge cases

- `keyHeight - 4 < 14`: max = 14; slider is effectively fixed at 14 until keys grow.
- Stored above current max: render and thumb use clamped value; do not overwrite store on clamp-only renders.
- `undefined` / missing: treat as 18.
- Companion: no new control; sanitize list unchanged.

## 8. Testing

- Unit: `maxKeyboardFontSize` / `effectiveKeyboardFontSize` clamp table (short keys, tall keys, undefined stored).
- Unit or snapshot: Backspace / Enter / Shift use `layout: "row"`.
- Settings: slider invokes `updateSettings` with in-range px.
- Manual: Normal / Focus (and Mini if still exposed), 1920×1080 and 1920×1008; live slider; restart persistence; Modes first; synth unchanged when slider moves; no overflow/clip at max with 4px padding.

## 9. Acceptance mapping (issue #228)

| Criterion | How met |
| --- | --- |
| Settings slider small → extra large with value shown | Min 14 → max 29 (≈80%–160%), value as px |
| Default = current size | 18px default |
| Persists | Existing `keyboardFontSize` profile field |
| No overflow Normal / Mini / Focus at common resolutions | Max tied to key height + row special labels |
| Live update | `updateSettings` → re-render |
| Companion unchanged | No tablet UI / sync |
| (Extra) Modes on top | Reorder Settings sections |
| (Extra) Numpad scales; synth does not | Explicit consumer split |
