// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";
import { invoke } from "@tauri-apps/api/core";

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

const invokeMock = vi.mocked(invoke);

function lastPreviewEnableCall() {
  const calls = invokeMock.mock.calls.filter(
    ([cmd]) => cmd === "cmd_set_input_preview_enabled",
  );
  return calls[calls.length - 1];
}

describe("setAppMode", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        focusModeOverride: false,
        micMode: false,
        keyboardSectionMode: "keyboard",
        inputPreviewVisible: true,
      },
      musicTeachingEnabled: false,
      restoreStack: [],
      profileHydrated: true,
      companionBridgeArmed: false,
      companionModeActive: false,
      companionSessionLive: false,
      focusModeActive: false,
      isAnimatingWindow: false,
      monitors: [],
      inputPreviewFrame: null,
    });
  });

  it("setAppMode('teaching') enables teaching and synthesizer section", async () => {
    await useAppStore.getState().setAppMode("teaching");
    expect(useAppStore.getState().musicTeachingEnabled).toBe(true);
    expect(useAppStore.getState().settings.keyboardSectionMode).toBe(
      "synthesizer",
    );
    expect(useAppStore.getState().restoreStack).toEqual([
      {
        reason: "teaching",
        patch: { mode: "normal", windowHeightRatio: "unset" },
      },
    ]);
  });

  it("setAppMode('teaching') clears preview frames and disables capture", async () => {
    useAppStore.setState({
      inputPreviewFrame: {
        bytes: new Uint8Array([0xff, 0xd8]),
        width: 2,
        height: 1,
      },
    });
    await useAppStore.getState().setAppMode("teaching");
    expect(useAppStore.getState().inputPreviewFrame).toBeNull();
    expect(lastPreviewEnableCall()).toEqual([
      "cmd_set_input_preview_enabled",
      { enabled: false },
    ]);
  });

  it("setAppMode('normal') from teaching clears teaching and restores keyboard mode", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      restoreStack: [
        {
          reason: "teaching",
          patch: { mode: "focus", windowHeightRatio: 0.6 },
        },
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        keyboardSectionMode: "synthesizer",
        focusModeOverride: false,
        micMode: false,
        inputPreviewVisible: true,
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

  it("setAppMode('normal') from teaching restores input preview capture", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      restoreStack: [
        {
          reason: "teaching",
          patch: { mode: "normal", windowHeightRatio: "unset" },
        },
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        keyboardSectionMode: "synthesizer",
        focusModeOverride: false,
        micMode: false,
        inputPreviewVisible: true,
      },
      profileHydrated: true,
    });
    await useAppStore.getState().setAppMode("normal");
    expect(lastPreviewEnableCall()).toEqual([
      "cmd_set_input_preview_enabled",
      { enabled: true },
    ]);
  });
});
