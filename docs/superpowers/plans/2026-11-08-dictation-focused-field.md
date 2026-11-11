# Dictation into the focused field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dictation types into the focused external field, stops on silence/max duration/Stop, and never starts (or silently drops text) when there is no target.

**Architecture:** Reuse `isMicFabEnabled` for the keyboard Mic key. Refuse start in `toggleDictation` and `cmd_start_dictation` when `is_input_focused()` is false. Make `restore_target_focus` / `SendInput` failures errors that become `stt-error`. Bound WinRT timeouts and `StopAsync`. Overlay Stop emits `dictation-overlay-stop` so the main store goes idle immediately. Groq flushes remaining audio on stop.

**Tech Stack:** React 19.3, Zustand 5, Vitest 4, Tauri 2.12, Rust 2021, `windows` 0.58 (`Media_SpeechRecognition`, `Foundation::TimeSpan`), `log` 0.4.

## Global Constraints

- Windows-only; do not add macOS/Linux stubs or `#[cfg(not(target_os = "windows"))]`.
- Do not restructure `src-tauri/src/lib.rs`.
- Do not change `src/components/keyboard/DictationButton.tsx`.
- Do not change `overlayShouldCaptureMic` (still `engine === "winrt"`).
- Do not log typed/dictated text, transcripts, clipboard, settings JSON, or keys.
- No-target user copy: `Select a text field to dictate`.
- Quiet ends (#198) are not `stt-error`.
- Spec: `docs/superpowers/specs/2026-11-08-dictation-focused-field-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/349
- Branch: `fix/349-dictation-focused-field` off current HEAD; PR targets `dev`.
- TDD: personal `test-driven-development` skill. Red with `--expect red` (status `fail`, not `error`), then green.
- Implementer models from parent picker JSON `model` (sdd-model-policy). Never `inherit`. Never fast.

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/lib/focusMode.ts` | `isMicFabEnabled`; add `micDictateAriaKey` |
| `src/lib/focusMode.test.ts` | Aria-key cases + existing FAB enablement |
| `src/components/keyboard/Keyboard.tsx` | Subscribe to `externalInputFocused`; disable Mic via `isMicFabEnabled` |
| `src/components/keyboard/KeyButton.tsx` | Transparent + disabled → opacity 0.45 |
| `src/components/keyboard/Keyboard.dictate.test.tsx` | Mic key disabled / aria / gray |
| `src/lib/dictationErrors.ts` | Shared no-target copy constant |
| `src/stores/slices/dictationSlice.ts` | Refuse start without `externalInputFocused` via `setLastError` |
| `src/stores/slices/dictationSlice.test.ts` | No-target refusal; stop still works |
| `src-tauri/src/stt/timeouts.rs` | Pure timeout constants + TimeSpan helper + tests |
| `src-tauri/src/commands/dictation.rs` | Start requires `focus_target::is_input_focused()` |
| `src-tauri/src/stt/mod.rs` | Start/stop `info!` logs; max-session guard |
| `src-tauri/src/stt/events.rs` | Result char-count log |
| `src-tauri/src/input/focus_target/mod.rs` | `restore_target_focus` errors when ours + no valid target |
| `src-tauri/src/input/focus_target/win32.rs` | Error if foreground restore fails |
| `src-tauri/src/input/keyboard/send.rs` | Error when `SendInput` sent ≠ expected |
| `src-tauri/src/stt/winrt.rs` | Result/Completed logs; silence timeouts; bounded `StopAsync` |
| `src/components/keyboard/DictationOverlay.tsx` | Optimistic local idle + emit `dictation-overlay-stop` |
| `src/App.tsx` | Listen `dictation-overlay-stop` → `stopDictation()` |
| `src/lib/dictationOverlayWindow.ts` | Hide retry once |
| `src-tauri/src/stt/groq/mod.rs` | Flush remainder on stop |

---

### Task 1: Keyboard Mic key gating

**Files:**
- Modify: `src/lib/focusMode.ts`
- Modify: `src/lib/focusMode.test.ts`
- Modify: `src/components/keyboard/Keyboard.tsx`
- Modify: `src/components/keyboard/KeyButton.tsx`
- Create: `src/components/keyboard/Keyboard.dictate.test.tsx`

**Interfaces:**
- Consumes: existing `isMicFabEnabled({ dictationState, canDictate, externalInputFocused })`
- Produces: `micDictateAriaKey(input) → "dictationStop" \| "dictationStart" \| "dictationUnavailableOffline" \| "dictationUnavailableUnsupported" \| "micModeSelectInput"`

- [ ] **Step 1: Rename the branch**

```powershell
git branch -m fix/349-dictation-focused-field
git status -sb
```

Expected: current branch is `fix/349-dictation-focused-field`.

- [ ] **Step 2: Write failing aria-key tests**

Append to `src/lib/focusMode.test.ts` (keep existing `isMicFabEnabled` tests). Import `micDictateAriaKey`:

```ts
  it("micDictateAriaKey is Stop while listening", () => {
    expect(
      micDictateAriaKey({
        dictationState: "listening",
        canDictate: false,
        externalInputFocused: false,
      }),
    ).toBe("dictationStop");
  });

  it("micDictateAriaKey is Start when idle, focused, canDictate", () => {
    expect(
      micDictateAriaKey({
        dictationState: "idle",
        canDictate: true,
        externalInputFocused: true,
        online: true,
        winrtSupported: true,
      }),
    ).toBe("dictationStart");
  });

  it("micDictateAriaKey is micModeSelectInput when idle without focus", () => {
    expect(
      micDictateAriaKey({
        dictationState: "idle",
        canDictate: true,
        externalInputFocused: false,
        online: true,
        winrtSupported: true,
      }),
    ).toBe("micModeSelectInput");
  });

  it("micDictateAriaKey is unsupported when idle, focused, cannot dictate, winrt unsupported", () => {
    expect(
      micDictateAriaKey({
        dictationState: "idle",
        canDictate: false,
        externalInputFocused: true,
        online: true,
        winrtSupported: false,
      }),
    ).toBe("dictationUnavailableUnsupported");
  });

  it("micDictateAriaKey is offline when idle, focused, cannot dictate, online false", () => {
    expect(
      micDictateAriaKey({
        dictationState: "idle",
        canDictate: false,
        externalInputFocused: true,
        online: false,
        winrtSupported: true,
      }),
    ).toBe("dictationUnavailableOffline");
  });
```

- [ ] **Step 3: Run aria-key tests — expect FAIL**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/lib/focusMode.test.ts --name micDictateAriaKey --expect red
```

Expected: JSON `status` is `fail` (export missing), not `error` from a typo.

- [ ] **Step 4: Implement `micDictateAriaKey`**

In `src/lib/focusMode.ts`, next to `isMicFabEnabled`:

```ts
export type MicDictateAriaKey =
  | "dictationStop"
  | "dictationStart"
  | "dictationUnavailableOffline"
  | "dictationUnavailableUnsupported"
  | "micModeSelectInput";

export function micDictateAriaKey(input: {
  dictationState: string;
  canDictate: boolean;
  externalInputFocused: boolean;
  online?: boolean;
  winrtSupported?: boolean;
}): MicDictateAriaKey {
  const listening =
    input.dictationState === "listening" ||
    input.dictationState === "processing";
  if (listening) return "dictationStop";
  if (isMicFabEnabled(input)) return "dictationStart";
  if (input.canDictate) return "micModeSelectInput";
  if (input.online && input.winrtSupported === false) {
    return "dictationUnavailableUnsupported";
  }
  return "dictationUnavailableOffline";
}
```

- [ ] **Step 5: Re-run aria-key tests — expect PASS**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/lib/focusMode.test.ts --name micDictateAriaKey --expect green
```

- [ ] **Step 6: Write failing Keyboard Mic-key test**

Create `src/components/keyboard/Keyboard.dictate.test.tsx` using the same Tauri/store mocks as `Keyboard.perf.test.tsx` (invoke, event, webviewWindow, updater, dictationOverlayWindow, motion, useContainerSize, useGroqDailyQuota). Do **not** mock `KeyButton`. After mocks, import `useAppStore` and `Keyboard`.

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { DEFAULT_PHYSICAL_KEY_STATE } from "../../lib/keyboardLayouts";
import { DEFAULT_SETTINGS } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    return Promise.resolve(undefined);
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getCurrent: () => ({ label: "main" }) },
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("../../lib/dictationOverlayWindow", () => ({
  showDictationOverlay: vi.fn(() => Promise.resolve()),
  hideDictationOverlay: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: vi.fn(() => true),
  afterNextPaint: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    ref: { current: null },
    width: 800,
    height: 280,
  }),
}));
vi.mock("../../hooks/useGroqDailyQuota", () => ({
  useGroqDailyQuota: () => null,
}));

import { useAppStore } from "../../stores/appStore";
import { Keyboard } from "./Keyboard";

function micButton() {
  return screen.getByRole("button", {
    name: /select a text field to dictate|start dictation|stop dictation/i,
  });
}

describe("Keyboard Mic key focus gating (#349)", () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, typingLanguage: "en" },
      focusModeActive: false,
      keyboardLayout: "qwerty",
      stickyModifiers: [],
      physicalKeyState: { ...DEFAULT_PHYSICAL_KEY_STATE },
      languagePickerOpen: false,
      dictationState: "idle",
      sttCapability: {
        engine: "winrt",
        groqConfigured: false,
        winrtSupported: true,
        online: true,
        canDictate: true,
      },
      externalInputFocused: false,
      musicTeachingEnabled: false,
      languageLessonPlaying: false,
      languageListAuthoringActive: false,
      freeWriteFocus: "notepad",
      inputMethods: [],
      profileHydrated: true,
    });
  });

  it("disables the Mic key with micModeSelectInput when no field is focused", () => {
    render(
      <div style={{ width: 800, height: 280 }}>
        <Keyboard />
      </div>,
    );
    const btn = micButton();
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-label")).toBe(
      "Select a text field to dictate",
    );
  });

  it("enables the Mic key when an external field is focused", () => {
    useAppStore.setState({ externalInputFocused: true });
    render(
      <div style={{ width: 800, height: 280 }}>
        <Keyboard />
      </div>,
    );
    const btn = screen.getByRole("button", { name: "Start dictation" });
    expect(btn).not.toBeDisabled();
  });

  it("keeps the Mic key enabled while listening even if focus is lost", () => {
    useAppStore.setState({
      dictationState: "listening",
      externalInputFocused: false,
    });
    render(
      <div style={{ width: 800, height: 280 }}>
        <Keyboard />
      </div>,
    );
    const btn = screen.getByRole("button", { name: "Stop dictation" });
    expect(btn).not.toBeDisabled();
  });

  it("grays the Mic key in transparent mode when disabled", () => {
    useAppStore.setState({
      focusModeActive: true,
      settings: {
        ...DEFAULT_SETTINGS,
        typingLanguage: "en",
        focusModeTransparent: true,
      },
      externalInputFocused: false,
    });
    render(
      <div style={{ width: 800, height: 280 }}>
        <Keyboard />
      </div>,
    );
    const btn = micButton();
    expect(btn).toBeDisabled();
    expect((btn as HTMLElement).style.opacity).toBe("0.45");
    expect((btn as HTMLElement).style.color).toBe("rgb(148, 163, 184)");
  });
});
```

- [ ] **Step 7: Run Keyboard Mic tests — expect FAIL**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/components/keyboard/Keyboard.dictate.test.tsx --expect red
```

Expected: FAIL because `dictateDisabled` ignores `externalInputFocused` and transparent disabled keys have no opacity.

- [ ] **Step 8: Wire Keyboard + KeyButton**

In `Keyboard.tsx`:
- Import `isMicFabEnabled` and `micDictateAriaKey` from `../../lib/focusMode` (keep existing `isTransparentUiActive` / `transparentKeyPalette` import).
- Add `const externalInputFocused = useAppStore((s) => s.externalInputFocused);`
- Replace `const dictateDisabled = !listening && !canDictate;` with:

```ts
  const dictateDisabled = !isMicFabEnabled({
    dictationState,
    canDictate,
    externalInputFocused,
  });
```

- Replace the aria-label block with:

```ts
  const dictateAriaLabel = t(
    micDictateAriaKey({
      dictationState,
      canDictate,
      externalInputFocused,
      online: sttCapability?.online,
      winrtSupported: sttCapability?.winrtSupported,
    }),
  );
```

Keep the groq remaining-percent suffix: if `!dictateDisabled && groqRemainingPercent !== null`, append `. ${t("dictationGroqRemainingToday")} ${groqRemainingPercent}%` as today.

Keep `dictateTextColor` `#94a3b8` when `dictateDisabled` and not listening.

In `KeyButton.tsx`, merge into `sharedStyle`:

```ts
  const sharedStyle = {
    ...(transparent
      ? {
          ...transparentOutlineStyle({
            active,
            outlineColor,
            color: textColor,
          }),
          fontSize,
        }
      : {
          fontSize,
          color: textColor,
          backgroundColor: bgColor,
        }),
    ...(transparent && disabled ? { opacity: 0.45 } : {}),
  };
```

Also update `CollapsedFab.tsx` to use `micDictateAriaKey` + `t(...)` instead of its duplicated if/else, so FAB and Mic key stay in lockstep. Do not change FAB enablement logic.

- [ ] **Step 9: Re-run Keyboard Mic tests — expect PASS**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/components/keyboard/Keyboard.dictate.test.tsx --expect green
```

Also:

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/lib/focusMode.test.ts --expect green
```

- [ ] **Step 10: Commit**

```powershell
git add src/lib/focusMode.ts src/lib/focusMode.test.ts src/components/keyboard/Keyboard.tsx src/components/keyboard/KeyButton.tsx src/components/keyboard/Keyboard.dictate.test.tsx src/components/layout/CollapsedFab.tsx
git commit -m "fix: disable keyboard Mic key until an external field is focused"
```

---

### Task 2: `toggleDictation` refuses start without a target

**Files:**
- Create: `src/lib/dictationErrors.ts`
- Modify: `src/stores/slices/dictationSlice.ts`
- Create: `src/stores/slices/dictationSlice.test.ts`

**Interfaces:**
- Consumes: `externalInputFocused` on the store; `setLastError`
- Produces: `DICTATION_SELECT_INPUT_ERROR = "Select a text field to dictate"`

- [ ] **Step 1: Write the failing slice test**

Create `src/stores/slices/dictationSlice.test.ts` using the same mock block as `src/stores/slices/suggestionsSlice.test.ts` (`invokeMock`, `notifyError`, tauri core/event/webview/updater, motion, notify). Then:

```ts
import { useAppStore } from "../appStore";
import { storeFlags } from "../storeFlags";
import { DICTATION_SELECT_INPUT_ERROR } from "../../lib/dictationErrors";
import { DEFAULT_SETTINGS } from "../../lib/types";

describe("toggleDictation no-target (#349)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    notifyError.mockReset();
    storeFlags.lastAnnouncedError = null;
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      dictationState: "idle",
      externalInputFocused: false,
      lastError: null,
      sttCapability: {
        engine: "winrt",
        groqConfigured: false,
        winrtSupported: true,
        online: true,
        canDictate: true,
      },
    });
  });

  it("does not start and toasts when no external field is focused", async () => {
    await useAppStore.getState().toggleDictation();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_start_dictation",
      expect.anything(),
    );
    expect(notifyError).toHaveBeenCalledWith(DICTATION_SELECT_INPUT_ERROR);
    expect(useAppStore.getState().dictationState).toBe("idle");
  });

  it("still stops while listening even if focus was lost", async () => {
    invokeMock.mockResolvedValue(undefined);
    useAppStore.setState({
      dictationState: "listening",
      externalInputFocused: false,
    });
    await useAppStore.getState().toggleDictation();
    expect(invokeMock).toHaveBeenCalledWith("cmd_stop_dictation");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_start_dictation",
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run slice test — expect FAIL**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/stores/slices/dictationSlice.test.ts --expect red
```

Expected: FAIL (`cmd_start_dictation` is invoked).

- [ ] **Step 3: Implement refusal**

Create `src/lib/dictationErrors.ts`:

```ts
/** Toast / lastError copy when dictation has no external text target. */
export const DICTATION_SELECT_INPUT_ERROR =
  "Select a text field to dictate";
```

In `toggleDictation`, after the listening/processing early-return and **before** the `canDictate` check:

```ts
    if (!get().externalInputFocused) {
      get().setLastError(DICTATION_SELECT_INPUT_ERROR);
      return;
    }
```

Import `DICTATION_SELECT_INPUT_ERROR` from `../../lib/dictationErrors`. Use `get().setLastError` (toasts) — do not `set({ lastError })`.

- [ ] **Step 4: Re-run slice test — expect PASS**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/stores/slices/dictationSlice.test.ts --expect green
```

- [ ] **Step 5: Commit**

```powershell
git add src/lib/dictationErrors.ts src/stores/slices/dictationSlice.ts src/stores/slices/dictationSlice.test.ts
git commit -m "fix: refuse dictation start when no external text field is focused"
```

---

### Task 3: Rust start gate + STT start/stop logs

**Files:**
- Create: `src-tauri/src/stt/timeouts.rs` (constants + tests; used again in Tasks 5–6)
- Modify: `src-tauri/src/stt/mod.rs` (mod + start/stop logs)
- Modify: `src-tauri/src/commands/dictation.rs`

**Interfaces:**
- Consumes: `crate::input::focus_target::is_input_focused`
- Produces: `stt::timeouts::{NO_INPUT_TARGET, MAX_SESSION, STOP_ASYNC, INITIAL_SILENCE, END_SILENCE, AUTO_STOP_SILENCE, duration_to_winrt}`
- Error string from `cmd_start_dictation` when unfocused: same as `NO_INPUT_TARGET`

- [ ] **Step 1: Write failing timeout + gate tests**

Create `src-tauri/src/stt/timeouts.rs`:

```rust
use std::time::Duration;
use windows::Foundation::TimeSpan;

pub const NO_INPUT_TARGET: &str = "Select a text field to dictate";

pub const INITIAL_SILENCE: Duration = Duration::from_secs(5);
pub const END_SILENCE: Duration = Duration::from_secs(10);
pub const AUTO_STOP_SILENCE: Duration = Duration::from_secs(10);
pub const STOP_ASYNC: Duration = Duration::from_secs(3);
pub const MAX_SESSION: Duration = Duration::from_secs(60);

pub fn duration_to_winrt(duration: Duration) -> TimeSpan {
    TimeSpan {
        Duration: (duration.as_nanos() / 100) as i64,
    }
}

pub fn refuse_start_without_focus(input_focused: bool) -> Result<(), &'static str> {
    if input_focused {
        Ok(())
    } else {
        Err(NO_INPUT_TARGET)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_refused_without_focus() {
        assert_eq!(
            refuse_start_without_focus(false).unwrap_err(),
            NO_INPUT_TARGET
        );
        assert!(refuse_start_without_focus(true).is_ok());
    }

    #[test]
    fn timeout_values_match_spec() {
        assert_eq!(INITIAL_SILENCE, Duration::from_secs(5));
        assert_eq!(END_SILENCE, Duration::from_secs(10));
        assert_eq!(AUTO_STOP_SILENCE, Duration::from_secs(10));
        assert_eq!(STOP_ASYNC, Duration::from_secs(3));
        assert_eq!(MAX_SESSION, Duration::from_secs(60));
    }

    #[test]
    fn duration_to_winrt_uses_100ns_ticks() {
        assert_eq!(duration_to_winrt(Duration::from_secs(5)).Duration, 50_000_000);
        assert_eq!(duration_to_winrt(Duration::from_secs(10)).Duration, 100_000_000);
        assert_eq!(duration_to_winrt(Duration::from_secs(3)).Duration, 30_000_000);
    }
}
```

Add `pub(crate) mod timeouts;` in `src-tauri/src/stt/mod.rs` next to the other `mod` lines.

In `cmd_start_dictation` (`src-tauri/src/commands/dictation.rs`), **before** `spawn_blocking`, if `!crate::input::focus_target::is_input_focused()` return `Err(crate::stt::timeouts::NO_INPUT_TARGET.to_string())`. Do not add this yet until the unit test exists; the unit test is the helper.

- [ ] **Step 2: Run timeout tests — first run without `mod timeouts` to confirm red, then add the module**

Write the tests in `timeouts.rs` first without adding `mod timeouts` — `cargo test` will not see them. Instead: add `mod timeouts;` with only the tests that call `refuse_start_without_focus` **before** the function exists... The file above includes both. Split: first add `mod timeouts;` with tests only and `todo!()` implementations so cargo compiles and tests fail.

Simplest TDD path that compiles: create the file with tests + unimplemented helper:

After adding `pub(crate) mod timeouts;`, temporarily leave `refuse_start_without_focus` as:

```rust
pub fn refuse_start_without_focus(_input_focused: bool) -> Result<(), &'static str> {
    Ok(())
}
```

Then run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib start_refused_without_focus
```

Expected: FAIL (Ok when false).

- [ ] **Step 3: Implement helper + command gate + logs**

Implement `refuse_start_without_focus` as in Step 1 (full file).

`cmd_start_dictation` after the companion-tablet check:

```rust
    if let Err(msg) = crate::stt::timeouts::refuse_start_without_focus(
        crate::input::focus_target::is_input_focused(),
    ) {
        return Err(msg.to_string());
    }
```

In `stt/mod.rs` `start_dictation`, after a successful `select_engine` `Use` arm, log (no text, no key):

```rust
log::info!(
    "stt start engine={} language={}",
    engine_name(engine),
    language
);
```

Do this once you know the engine, immediately before calling `winrt::start_dictation` / `groq::start_dictation`. `language` is the function argument.

In `stop_dictation`, at the top:

```rust
log::info!("stt stop requested");
```

After backends return, before `Ok(())`:

```rust
log::info!("stt stop completed");
```

If a backend `stop_dictation` returns `Err`, `log::error!("stt stop failed: {}", crate::logging::redact(&e.to_string()));` then return the error.

- [ ] **Step 4: Re-run tests — expect PASS**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib start_refused_without_focus
cargo test --manifest-path src-tauri/Cargo.toml --lib timeout_values_match_spec
cargo test --manifest-path src-tauri/Cargo.toml --lib duration_to_winrt_uses_100ns_ticks
```

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/stt/timeouts.rs src-tauri/src/stt/mod.rs src-tauri/src/commands/dictation.rs
git commit -m "fix: block dictation start in Rust when no text field is focused"
```

---

### Task 4: Injection and focus-restore failures are errors

**Files:**
- Modify: `src-tauri/src/input/focus_target/mod.rs`
- Modify: `src-tauri/src/input/focus_target/win32.rs`
- Modify: `src-tauri/src/input/focus_target/tests.rs`
- Modify: `src-tauri/src/input/keyboard/send.rs`
- Modify: `src-tauri/src/input/keyboard/tests.rs`
- Modify: `src-tauri/src/stt/events.rs`

**Interfaces:**
- Consumes: `stt::timeouts::NO_INPUT_TARGET`
- Produces: `restore_focus_plan(ours_is_foreground, has_target, target_valid) -> RestoreFocusPlan`
- Produces: `send_input_failed(sent, expected) -> bool`

- [ ] **Step 1: Write failing pure tests**

In `src-tauri/src/input/focus_target/mod.rs` (or a small `restore.rs` next to it — prefer adding the enum + fn at the bottom of `mod.rs` to avoid a new file unless `mod.rs` is already huge; it is large, so add `restore_plan.rs` in the same folder):

Create `src-tauri/src/input/focus_target/restore_plan.rs`:

```rust
use crate::stt::timeouts::NO_INPUT_TARGET;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreFocusPlan {
    LeaveForeground,
    Restore,
    Error(&'static str),
}

pub const FOREGROUND_RESTORE_FAILED: &str =
    "Could not return focus to the text field";

pub fn restore_focus_plan(
    ours_is_foreground: bool,
    has_target: bool,
    target_valid: bool,
) -> RestoreFocusPlan {
    if !ours_is_foreground {
        return RestoreFocusPlan::LeaveForeground;
    }
    if !has_target || !target_valid {
        return RestoreFocusPlan::Error(NO_INPUT_TARGET);
    }
    RestoreFocusPlan::Restore
}

pub fn foreground_restore_failed(wanted: isize, actual: isize) -> bool {
    wanted != actual
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leave_alone_when_we_are_not_foreground() {
        assert_eq!(
            restore_focus_plan(false, false, false),
            RestoreFocusPlan::LeaveForeground
        );
    }

    #[test]
    fn error_when_ours_and_no_target() {
        assert_eq!(
            restore_focus_plan(true, false, false),
            RestoreFocusPlan::Error(NO_INPUT_TARGET)
        );
    }

    #[test]
    fn error_when_ours_and_invalid_target() {
        assert_eq!(
            restore_focus_plan(true, true, false),
            RestoreFocusPlan::Error(NO_INPUT_TARGET)
        );
    }

    #[test]
    fn restore_when_ours_and_valid_target() {
        assert_eq!(
            restore_focus_plan(true, true, true),
            RestoreFocusPlan::Restore
        );
    }

    #[test]
    fn foreground_mismatch_is_failure() {
        assert!(foreground_restore_failed(1, 2));
        assert!(!foreground_restore_failed(1, 1));
    }
}
```

Add `mod restore_plan;` in `focus_target/mod.rs`.

In `src-tauri/src/input/keyboard/send.rs` add:

```rust
pub(super) fn send_input_incomplete(sent: u32, expected: u32) -> bool {
    sent != expected
}
```

And a test in `src-tauri/src/input/keyboard/tests.rs`:

```rust
#[test]
fn send_input_incomplete_when_short_count() {
    assert!(super::send_input_incomplete(0, 1));
    assert!(super::send_input_incomplete(1, 2));
    assert!(!super::send_input_incomplete(2, 2));
}
```

(`send.rs` is `mod send` under keyboard — export the helper so tests can call `crate::input::keyboard::send::send_input_incomplete` or use `super::` from tests.rs depending on existing module layout. Match `keyboard/tests.rs` existing `use super`.)

First run with `restore_focus_plan` always returning `LeaveForeground` to get red.

- [ ] **Step 2: Run tests — expect FAIL then implement**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib error_when_ours_and_no_target
```

Expected first: FAIL.

Implement the real `restore_focus_plan` / `send_input_incomplete` as above.

- [ ] **Step 3: Wire restore_target_focus and SendInput**

`restore_target_focus` becomes:

```rust
pub fn restore_target_focus() -> Result<()> {
    unsafe {
        let fg = GetForegroundWindow();
        let ours = is_our_window(fg);
        let target = TARGET_HWND.lock().ok().and_then(|g| *g);
        let hwnd = target.map(usize_to_hwnd);
        let valid = hwnd.is_some_and(is_valid_typing_target);
        match restore_plan::restore_focus_plan(ours, target.is_some(), valid) {
            restore_plan::RestoreFocusPlan::LeaveForeground => {
                log::warn!("restore_target_focus skipped: panel not foreground");
                return Ok(());
            }
            restore_plan::RestoreFocusPlan::Error(msg) => {
                log::warn!("restore_target_focus failed: no valid target");
                anyhow::bail!("{msg}");
            }
            restore_plan::RestoreFocusPlan::Restore => {}
        }
        let hwnd = hwnd.expect("valid target");
        bring_to_foreground(hwnd)?;
    }
    Ok(())
}
```

In `bring_to_foreground`, after `SetForegroundWindow` / `BringWindowToTop`, if `GetForegroundWindow() != hwnd`:

```rust
    log::warn!("SetForegroundWindow failed");
    anyhow::bail!("{}", crate::input::focus_target::restore_plan::FOREGROUND_RESTORE_FAILED);
```

(`restore_plan` is a child module — export `FOREGROUND_RESTORE_FAILED` via `pub(crate) use restore_plan::{...}` if win32 cannot reach it. `win32.rs` is `focus_target/win32.rs`; it can `use super::restore_plan::{foreground_restore_failed, FOREGROUND_RESTORE_FAILED}`.)

Use `foreground_restore_failed(hwnd.0 as isize, GetForegroundWindow().0 as isize)` — HWND representation in windows 0.58 is `HWND(pub *mut c_void)` or isize; compare the values the crate uses. Do not invent. If `.0` is a pointer, compare `GetForegroundWindow() != hwnd` directly and keep `foreground_restore_failed` for tests with isize ids.

In `send_vk` / `send_unicode`, replace `if sent == 0` with `if send_input_incomplete(sent, expected)` where expected is `1` for vk and `2` for unicode. On failure: `log::warn!("SendInput short count sent={sent} expected={expected}");` then `Err`.

In `handle_result` (`events.rs`), after the blank-audio filters, before `type_text`:

```rust
    log::info!("stt result chars={}", text.chars().count());
```

Existing `if let Err(error) = type_text(text) { emit_error(...); return; }` already skips `stt-result`. Keep that. Do not log `text`.

- [ ] **Step 4: Re-run tests — expect PASS**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib error_when_ours_and_no_target
cargo test --manifest-path src-tauri/Cargo.toml --lib send_input_incomplete_when_short_count
cargo test --manifest-path src-tauri/Cargo.toml --lib leave_alone_when_we_are_not_foreground
```

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/input/focus_target src-tauri/src/input/keyboard/send.rs src-tauri/src/input/keyboard/tests.rs src-tauri/src/stt/events.rs
git commit -m "fix: surface dictation injection failures instead of dropping text"
```

---

### Task 5: WinRT result logs and silence timeouts

**Files:**
- Modify: `src-tauri/src/stt/winrt.rs`
- Uses: `stt::timeouts::{INITIAL_SILENCE, END_SILENCE, AUTO_STOP_SILENCE, duration_to_winrt}`

**Interfaces:**
- Consumes: timeout constants from Task 3
- Produces: WinRT session configured with those timeouts before `StartAsync`

- [ ] **Step 1: Write a failing compile-time/config test if needed**

Timeout values are already tested in Task 3. Add a helper that returns the three TimeSpans so winrt.rs stays thin:

In `timeouts.rs`:

```rust
pub struct WinrtSilenceTimeouts {
    pub initial: TimeSpan,
    pub end: TimeSpan,
    pub auto_stop: TimeSpan,
}

pub fn winrt_silence_timeouts() -> WinrtSilenceTimeouts {
    WinrtSilenceTimeouts {
        initial: duration_to_winrt(INITIAL_SILENCE),
        end: duration_to_winrt(END_SILENCE),
        auto_stop: duration_to_winrt(AUTO_STOP_SILENCE),
    }
}
```

Test:

```rust
    #[test]
    fn winrt_silence_timeouts_match_spec_ticks() {
        let t = winrt_silence_timeouts();
        assert_eq!(t.initial.Duration, 50_000_000);
        assert_eq!(t.end.Duration, 100_000_000);
        assert_eq!(t.auto_stop.Duration, 100_000_000);
    }
```

- [ ] **Step 2: Run new test — expect FAIL until helper exists, then PASS**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib winrt_silence_timeouts_match_spec_ticks
```

- [ ] **Step 3: Apply timeouts and logs in `winrt.rs`**

After `CompileConstraintsAsync` succeeds, before `ResultGenerated`:

```rust
    let timeouts = recognizer.Timeouts()?;
    let configured = super::timeouts::winrt_silence_timeouts();
    timeouts.SetInitialSilenceTimeout(configured.initial)?;
    timeouts.SetEndSilenceTimeout(configured.end)?;
    session.SetAutoStopSilenceTimeout(configured.auto_stop)?;
```

(`session` is `recognizer.ContinuousRecognitionSession()?` — get it before setting AutoStop.)

In `ResultGenerated`, log status always; only `handle_result` on Success:

```rust
            let status = result.Status()?;
            if status != SpeechRecognitionResultStatus::Success {
                log::warn!("winrt ResultGenerated status={status:?}");
                return Ok(());
            }
            let text = result.Text()?.to_string();
            log::info!("winrt ResultGenerated chars={}", text.chars().count());
            handle_result(&app_for_results, &text);
```

In `Completed`, log `status={status:?}` at info. Quiet ends stay non-errors (`is_quiet_end` unchanged).

- [ ] **Step 4: Run existing winrt unit tests**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib quiet_end_includes_timeout_pause_and_cancel
cargo test --manifest-path src-tauri/Cargo.toml --lib runtime_busy_while_stopping
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/stt/timeouts.rs src-tauri/src/stt/winrt.rs
git commit -m "fix: log WinRT dictation results and stop on silence timeouts"
```

---

### Task 6: Max-session guard and bounded `StopAsync`

**Files:**
- Modify: `src-tauri/src/stt/mod.rs`
- Modify: `src-tauri/src/stt/winrt.rs`
- Modify: `src-tauri/src/stt/timeouts.rs`

**Interfaces:**
- Consumes: `MAX_SESSION`, `STOP_ASYNC`
- Produces: `wait_bounded` helper; session generation so a stale guard cannot stop a newer session

- [ ] **Step 1: Write failing tests for guard + wait helper**

In `timeouts.rs`:

```rust
pub fn max_session_expired(elapsed: Duration, limit: Duration) -> bool {
    elapsed >= limit
}

pub fn wait_bounded_timed_out(elapsed: Duration, limit: Duration) -> bool {
    elapsed >= limit
}
```

Tests:

```rust
    #[test]
    fn max_session_expires_at_limit() {
        assert!(!max_session_expired(Duration::from_secs(59), MAX_SESSION));
        assert!(max_session_expired(Duration::from_secs(60), MAX_SESSION));
    }

    #[test]
    fn stop_async_timeout_at_three_seconds() {
        assert!(!wait_bounded_timed_out(Duration::from_secs(2), STOP_ASYNC));
        assert!(wait_bounded_timed_out(Duration::from_secs(3), STOP_ASYNC));
    }
```

- [ ] **Step 2: Run — expect FAIL then implement helpers**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib max_session_expires_at_limit
```

- [ ] **Step 3: Implement wait + guard + bounded stop**

Add to `timeouts.rs`:

```rust
use std::sync::mpsc;
use std::thread;

pub fn wait_bounded<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
    limit: Duration,
) -> Result<T, ()> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(work());
    });
    rx.recv_timeout(limit).map_err(|_| ())
}
```

In `winrt::stop_dictation`, replace `let _ = stop.get();` with:

```rust
    let started = std::time::Instant::now();
    match super::timeouts::wait_bounded(move || stop.get(), super::timeouts::STOP_ASYNC) {
        Ok(Ok(())) => {
            log::info!(
                "stt stop completed engine=winrt duration_ms={}",
                started.elapsed().as_millis()
            );
        }
        Ok(Err(e)) => {
            log::error!(
                "stt stop failed engine=winrt err={}",
                crate::logging::redact(&e.to_string())
            );
        }
        Err(()) => {
            log::error!("stt stop timed out engine=winrt");
        }
    }
```

`stop` is `IAsyncAction` — `get()` may need `stop` to be `Send`. If the WinRT op is `!Send`, instead:

```rust
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(stop.get());
    });
    match rx.recv_timeout(super::timeouts::STOP_ASYNC) { ... }
```

If `stop` itself is `!Send`, wait on a dedicated thread started **before** moving other session fields, or use `std::thread::scope` if the type allows. If you cannot move `stop`, poll with `Duration` using `thread::sleep` chunks totaling 3 s is **not** acceptable as a hang. Prefer moving the whole `recognizer` into the waiter thread.

Always remove tokens, `Close()` the recognizer, and `emit_state(..., Idle, None)` after the wait, including on timeout.

In `stt/mod.rs` `start_dictation`, after a backend starts successfully, spawn a max-session thread that captures a generation `u64` (add `session_generation: u64` on `RouterState`, bump on each start):

```rust
let gen = { /* bump and read */ };
let limit = timeouts::MAX_SESSION;
thread::spawn(move || {
    thread::sleep(limit);
    let still = router().lock().ok().is_some_and(|g| {
        g.active.is_some() && g.session_generation == gen
    });
    if still {
        log::info!("stt max session reached");
        let _ = stop_dictation();
    }
});
```

Do not emit `stt-error` for this path. Existing Idle emit from backend stop is enough.

- [ ] **Step 4: Re-run helper tests + winrt busy tests**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib max_session_expires_at_limit
cargo test --manifest-path src-tauri/Cargo.toml --lib stop_async_timeout_at_three_seconds
cargo test --manifest-path src-tauri/Cargo.toml --lib runtime_busy_while_stopping
```

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/stt/timeouts.rs src-tauri/src/stt/mod.rs src-tauri/src/stt/winrt.rs
git commit -m "fix: bound dictation StopAsync and cap session length"
```

---

### Task 7: Optimistic overlay Stop

**Files:**
- Modify: `src/components/keyboard/DictationOverlay.tsx`
- Modify: `src/components/keyboard/DictationOverlay.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/dictationOverlayWindow.ts`
- Modify: `src/lib/dictationOverlayWindow.test.ts` (add hide-retry test if you extract a helper)

**Interfaces:**
- Consumes: `stopDictation()` on the main store
- Produces: event name `dictation-overlay-stop` (frontend `emit` / `listen`)

- [ ] **Step 1: Write failing overlay test**

Update `DictationOverlay.test.tsx`:

- Mock `emit` from `@tauri-apps/api/event` (already mocked `listen`; add `emit: vi.fn(async () => {})`).
- Import `fireEvent`, `screen` from testing-library.
- Mock `invoke` as today.

```tsx
  it("Stop hides the pill and emits dictation-overlay-stop without waiting on invoke", async () => {
    const { emit } = await import("@tauri-apps/api/event");
    const { invoke } = await import("@tauri-apps/api/core");
    const { getByRole, container } = render(<DictationOverlay />);
    const stop = getByRole("button", { name: "dictationStop" });
    fireEvent.click(stop);
    const pill = container.querySelector("div.rounded-full");
    expect(pill?.parentElement?.className).toContain("items-end");
    // local state idle → entered false → pill still in DOM but opacity-0
    expect(pill?.className).toContain("opacity-0");
    expect(emit).toHaveBeenCalledWith("dictation-overlay-stop");
    expect(invoke).not.toHaveBeenCalledWith("cmd_stop_dictation");
  });
```

If the pill unmounts when idle, assert it is gone instead of `opacity-0`. Match the component: `active = state !== "idle"` only affects the visualizer; the pill stays. `entered` becomes false on idle → `opacity-0`.

- [ ] **Step 2: Run overlay test — expect FAIL**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/components/keyboard/DictationOverlay.test.tsx --name "Stop hides" --expect red
```

- [ ] **Step 3: Implement overlay + App listener + hide retry**

`DictationOverlay.tsx`:
- Import `emit` from `@tauri-apps/api/event` (in addition to `listen`).
- Import `logError` from `../../lib/log`.

```tsx
          onClick={() => {
            setState("idle");
            void emit("dictation-overlay-stop").catch((error: unknown) => {
              logError("dictationOverlay", "Failed to emit overlay stop", {
                error,
              });
            });
          }}
```

Do **not** invoke `cmd_stop_dictation` from the overlay.

In `App.tsx` event `useEffect`, add:

```ts
    unlisteners.push(
      listen("dictation-overlay-stop", () => {
        void useAppStore.getState().stopDictation();
      }),
    );
```

`hideDictationOverlay` in `dictationOverlayWindow.ts`:

```ts
export async function hideDictationOverlay(): Promise<void> {
  overlayWanted = false;
  const attempt = async (): Promise<void> => {
    const existing = await WebviewWindow.getByLabel(DICTATION_OVERLAY_LABEL);
    await existing?.hide();
  };
  try {
    await attempt();
  } catch (error) {
    logError("dictationOverlay", "Failed to hide dictation overlay", { error });
    try {
      await attempt();
    } catch (retryError) {
      logError("dictationOverlay", "Failed to hide dictation overlay retry", {
        error: retryError,
      });
    }
  }
}
```

- [ ] **Step 4: Re-run overlay tests — expect PASS**

```powershell
node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs --cwd . --file src/components/keyboard/DictationOverlay.test.tsx --expect green
```

- [ ] **Step 5: Commit**

```powershell
git add src/components/keyboard/DictationOverlay.tsx src/components/keyboard/DictationOverlay.test.tsx src/App.tsx src/lib/dictationOverlayWindow.ts
git commit -m "fix: hide dictation overlay immediately when Stop is pressed"
```

---

### Task 8: Groq flushes remainder on stop

**Files:**
- Modify: `src-tauri/src/stt/groq/mod.rs`
- Modify: `src-tauri/src/stt/groq/tests.rs`

**Interfaces:**
- Consumes: existing `MIN_SPEECH_SECS`, `handle_result`
- Produces: `should_flush_remainder_on_stop(speech_started: bool, chunk_secs: f32, min_secs: f32) -> bool`

- [ ] **Step 1: Write failing helper test**

In `groq/tests.rs`:

```rust
#[test]
fn flush_remainder_when_speech_was_captured() {
    assert!(super::should_flush_remainder_on_stop(true, 0.9, 0.8));
    assert!(!super::should_flush_remainder_on_stop(true, 0.2, 0.8));
    assert!(!super::should_flush_remainder_on_stop(false, 2.0, 0.8));
}
```

Add `pub(super) fn should_flush_remainder_on_stop(...)` in `groq/mod.rs` (initially `false` for red).

- [ ] **Step 2: Run — expect FAIL**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib flush_remainder_when_speech_was_captured
```

- [ ] **Step 3: Implement helper + flush after the capture loop**

```rust
pub(super) fn should_flush_remainder_on_stop(
    speech_started: bool,
    chunk_secs: f32,
    min_secs: f32,
) -> bool {
    speech_started && chunk_secs >= min_secs * 0.7
}
```

Replace `// Do not flush remainder on stop` with: after the `while !stop_flag` loop, take remaining samples from `cursor` to end (no silence trim), and if `should_flush_remainder_on_stop(speech_started.is_some(), chunk_secs, MIN_SPEECH_SECS)` then `set_processing(true)`, `transcribe`, `handle_result` even when `stop_flag` is true, then `set_processing(false)`. Log `stt/groq flush remainder chars=` via existing `log::debug`/`log::info` with **char count only**. Do not wait on this from `stop_dictation` — Idle stays immediate; the lingering worker types when transcription returns.

Keep `ENERGY_THRESHOLD = 0.004`. Do not add noise-floor adaptation in this task.

- [ ] **Step 4: Re-run — expect PASS**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib flush_remainder_when_speech_was_captured
```

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/stt/groq/mod.rs src-tauri/src/stt/groq/tests.rs
git commit -m "fix: transcribe Groq audio remaining when dictation stops"
```

---

## Self-review

**Spec coverage**
- Keyboard Mic disabled / gray / aria / no start without focus → Tasks 1–2
- Rust start gate → Task 3
- Injection `stt-error`, no silent drop → Task 4
- WinRT logs + silence auto-stop → Task 5
- Max session + StopAsync bound + overlay hides → Tasks 6–7
- Groq Stop does not drop speech → Task 8
- Overlay Stop optimistic → Task 7
- Diagnostics in packaged logs → Tasks 3–6
- `overlayShouldCaptureMic` unchanged (H1 not confirmed)
- #198 quiet end preserved (Task 5 does not emit error on `is_quiet_end`)
- Companion dictation / `DictationButton.tsx` / `lib.rs` restructure out of scope

**Placeholder scan:** none.

**Type consistency:** `NO_INPUT_TARGET` / `DICTATION_SELECT_INPUT_ERROR` / `en.micModeSelectInput` are the same English sentence. Event name `dictation-overlay-stop` is used in overlay emit and App listen.
