// @vitest-environment jsdom
/**
 * Real `<Keyboard />` profiler for issue #281 (sticky typing).
 * Counts `KeyButton` renders while sticky Shift is held and 20 letter keys fire.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Profiler,
  type ComponentProps,
  type ProfilerOnRenderCallback,
} from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_PHYSICAL_KEY_STATE } from "../../lib/keyboardLayouts";
import { DEFAULT_SETTINGS } from "../../lib/types";

let keyButtonRenderCount = 0;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    if (cmd === "cmd_press_key") return Promise.resolve({ ok: true });
    if (cmd === "cmd_type_text") return Promise.resolve({ ok: true });
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

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

vi.mock("./KeyButton", async () => {
  const actual = await vi.importActual<typeof import("./KeyButton")>("./KeyButton");
  const { memo: memoFn } = await import("react");
  function CountingKeyButton(props: ComponentProps<typeof actual.KeyButton>) {
    keyButtonRenderCount += 1;
    return <actual.KeyButton {...props} />;
  }
  return {
    KeyButton: memoFn(CountingKeyButton),
  };
});

import { useAppStore } from "../../stores/appStore";
import { Keyboard } from "./Keyboard";

const STROKES = 20;

describe("Keyboard sticky-typing profiler (#281)", () => {
  beforeEach(() => {
    keyButtonRenderCount = 0;
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, typingLanguage: "en" },
      focusModeActive: false,
      keyboardLayout: "qwerty",
      stickyModifiers: [],
      physicalKeyState: { ...DEFAULT_PHYSICAL_KEY_STATE },
      languagePickerOpen: false,
      dictationState: "idle",
      musicTeachingEnabled: false,
      languageLessonPlaying: false,
      languageListAuthoringActive: false,
      freeWriteFocus: "notepad",
      inputMethods: [],
      profileHydrated: true,
    });
  });

  it("memoized labels keep KeyButton renders far below full-keyboard×strokes", async () => {
    let commits = 0;
    let totalActualMs = 0;
    const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
      if (phase === "update") {
        commits += 1;
        totalActualMs += actualDuration;
      }
    };

    render(
      <Profiler id="real-keyboard-sticky" onRender={onRender}>
        <div style={{ width: 800, height: 280 }}>
          <Keyboard />
        </div>
      </Profiler>,
    );

    // Sticky Shift on (both left/right shift share the same sticky flag).
    await act(async () => {
      useAppStore.getState().toggleSticky("shift");
    });

    keyButtonRenderCount = 0;
    commits = 0;
    totalActualMs = 0;

    // Prefer letter keys that are not special-labeled.
    const letterButtons = screen
      .getAllByRole("button")
      .filter((b) => /^[A-Za-z]$/.test(b.textContent.trim()));
    expect(letterButtons.length).toBeGreaterThanOrEqual(STROKES);

    for (let i = 0; i < STROKES; i += 1) {
      const btn = letterButtons[i % letterButtons.length];
      await act(async () => {
        fireEvent.click(btn);
      });
    }

     
    console.log(
      JSON.stringify({
        scenario: "real-keyboard-sticky-typing-20",
        strokes: STROKES,
        updateCommits: commits,
        keyButtonRenders: keyButtonRenderCount,
        totalActualMs: Number(totalActualMs.toFixed(3)),
      }),
    );

    // Full re-render of ~80 keys × 20 strokes would be ~1600. With memo + stable
    // labels, expect active-key transitions only (well under 1/4 of that).
    expect(keyButtonRenderCount).toBeLessThan(400);
    expect(keyButtonRenderCount).toBeGreaterThan(0);
  });
});
