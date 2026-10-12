# Keyboard font size settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings slider for keyboard/numpad label font size (height-clamped), row layout for Backspace/Enter/Shift, decouple synth, put Modes first in Settings.

**Architecture:** Pure clamp helpers + session `keyboardKeyHeightPx` for slider max; existing `keyboardFontSize` persists; Keyboard/NumKeypad use effective size; Synthesizer uses fixed px.

**Tech Stack:** React 19, Zustand, Vitest, Tauri Windows app.

## Global Constraints

- Windows only; no companion sync for this setting.
- Default stored size remains 18px; min 14; max `keyHeight - 4` (floor 14).
- Do not commit unless the user asks.

---

### Task 1: Font-size clamp helpers

**Files:**
- Create: `src/lib/keyboardFontSize.ts`
- Test: `src/lib/keyboardFontSize.test.ts`

**Interfaces:**
- Produces: `KEYBOARD_FONT_SIZE_DEFAULT`, `KEYBOARD_FONT_SIZE_MIN`, `KEYBOARD_FONT_SIZE_PADDING_PX`, `maxKeyboardFontSize(keyHeight: number): number`, `effectiveKeyboardFontSize(stored: number | undefined, keyHeight: number): number`

- [x] **Step 1:** Write failing tests for max/effective clamp table
- [x] **Step 2:** Run TDD red
- [x] **Step 3:** Implement helpers
- [x] **Step 4:** Run TDD green

---

### Task 2: Special keys row layout

**Files:**
- Modify: `src/lib/keyboardLayouts.ts`
- Modify: `src/components/keyboard/SpecialKeyLabel.tsx` (unify row sizing if needed)
- Test: extend `src/lib/keyboardFontSize.test.ts` or small layout assert test

- [x] **Step 1:** Test that backspace/enter/shift use `layout: "row"`
- [x] **Step 2:** Change SPECIAL_KEY_LABELS; adjust SpecialKeyLabel row to use ~fontSize for symbol
- [x] **Step 3:** Green

---

### Task 3: Session key height + Keyboard/NumKeypad/Synth consumers

**Files:**
- Modify: `src/stores/appStore.ts` (session `keyboardKeyHeightPx` + setter)
- Modify: `src/components/keyboard/Keyboard.tsx`
- Modify: `src/components/mouse/NumKeypad.tsx`
- Modify: `src/components/keyboard/Synthesizer.tsx`

- [x] **Step 1:** Publish keyHeight from Keyboard; use effective font size
- [x] **Step 2:** NumKeypad uses helper with local metrics
- [x] **Step 3:** Synth fixed constants (no settings.keyboardFontSize)

---

### Task 4: Settings UI + Modes reorder + i18n

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/i18n/*.ts` (all locales)

- [x] **Step 1:** Move modesSection to top of scroll content
- [x] **Step 2:** Appearance slider bound to keyboardFontSize with min/max/thumb clamp + px label
- [x] **Step 3:** i18n key `keyboardFontSize` in all locales
- [x] **Step 4:** Run vitest for touched tests; typecheck if practical

---

### Task 5: Spec coverage check

- [x] Verify acceptance mapping from design spec §9
