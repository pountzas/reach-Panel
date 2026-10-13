// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";

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
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

import { useAppStore } from "./appStore";

describe("setAppMode", () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        focusModeOverride: false,
        micMode: false,
        keyboardSectionMode: "keyboard",
      },
      musicTeachingEnabled: false,
      modeBeforeTeaching: null,
      windowHeightRatioBeforeTeaching: null,
      profileHydrated: true,
      companionBridgeArmed: false,
      companionModeActive: false,
      companionSessionLive: false,
      focusModeActive: false,
      isAnimatingWindow: false,
      monitors: [],
    });
  });

  it("setAppMode('teaching') enables teaching and synthesizer section", async () => {
    await useAppStore.getState().setAppMode("teaching");
    expect(useAppStore.getState().musicTeachingEnabled).toBe(true);
    expect(useAppStore.getState().settings.keyboardSectionMode).toBe(
      "synthesizer",
    );
    expect(useAppStore.getState().modeBeforeTeaching).toBe("normal");
  });

  it("setAppMode('normal') from teaching clears teaching and restores keyboard mode", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      modeBeforeTeaching: "focus",
      windowHeightRatioBeforeTeaching: 0.6,
      settings: {
        ...DEFAULT_SETTINGS,
        keyboardSectionMode: "synthesizer",
        focusModeOverride: false,
        micMode: false,
      },
      profileHydrated: true,
    });
    await useAppStore.getState().setAppMode("normal");
    expect(useAppStore.getState().musicTeachingEnabled).toBe(false);
    expect(useAppStore.getState().settings.keyboardSectionMode).toBe(
      "keyboard",
    );
    expect(useAppStore.getState().settings.focusModeOverride).toBe(false);
  });
});
