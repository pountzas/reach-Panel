// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    const btn = micButton() as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
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
    const btn = screen.getByRole("button", {
      name: "Start dictation",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
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
    const btn = screen.getByRole("button", {
      name: "Stop dictation",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
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
    const btn = micButton() as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.style.opacity).toBe("0.45");
    expect(btn.style.color).toBe("rgb(148, 163, 184)");
  });
});
