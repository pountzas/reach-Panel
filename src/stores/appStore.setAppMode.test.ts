// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  clear as clearInputPreviewFrames,
  getLatest as getLatestInputPreviewFrame,
  publish as publishInputPreviewFrame,
} from "../lib/inputPreviewFrames";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((message: ArrayBuffer) => void) | null = null;
  },
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
const listenMock = vi.mocked(listen);

/** Captured at import time — `setAppMode` beforeEach clears invoke mock calls. */
const previewChannel = (() => {
  const entry = invokeMock.mock.calls.find(
    ([cmd]) => cmd === "cmd_subscribe_input_preview",
  );
  if (!entry) throw new Error("cmd_subscribe_input_preview was not invoked");
  return (entry[1] as { channel: { onmessage: (m: ArrayBuffer) => void } })
    .channel;
})();

function lastPreviewEnableCall() {
  const calls = invokeMock.mock.calls.filter(
    ([cmd]) => cmd === "cmd_set_input_preview_enabled",
  );
  return calls[calls.length - 1];
}

function listenHandler(
  eventName: string,
): (event: { payload: unknown }) => void {
  const entry = listenMock.mock.calls.find(([name]) => name === eventName);
  if (!entry) {
    throw new Error(`listen was not registered for ${eventName}`);
  }
  return entry[1] as (event: { payload: unknown }) => void;
}

describe("setAppMode", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    clearInputPreviewFrames();
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
    });
  });

  afterEach(() => {
    clearInputPreviewFrames();
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
    publishInputPreviewFrame({
      bytes: new Uint8Array([0xff, 0xd8]),
      width: 2,
      height: 1,
    });
    await useAppStore.getState().setAppMode("teaching");
    expect(getLatestInputPreviewFrame()).toBeNull();
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

describe("input preview clear paths", () => {
  beforeEach(() => {
    clearInputPreviewFrames();
    publishInputPreviewFrame({
      bytes: new Uint8Array([0xff, 0xd8]),
      width: 2,
      height: 1,
    });
  });

  afterEach(() => {
    clearInputPreviewFrames();
  });

  it("input-preview-cleared clears the module frame store", () => {
    listenHandler("input-preview-cleared")({ payload: undefined });
    expect(getLatestInputPreviewFrame()).toBeNull();
  });

  it("input-focus-changed unfocused clears the module frame store", () => {
    listenHandler("input-focus-changed")({
      payload: { focused: false },
    });
    expect(getLatestInputPreviewFrame()).toBeNull();
    expect(useAppStore.getState().externalInputFocused).toBe(false);
  });

  it("input-focus-changed focused keeps the module frame store", () => {
    listenHandler("input-focus-changed")({
      payload: { focused: true },
    });
    expect(getLatestInputPreviewFrame()).not.toBeNull();
    expect(useAppStore.getState().externalInputFocused).toBe(true);
  });

  it("channel frames go to the module store without a Zustand setState", () => {
    clearInputPreviewFrames();
    const setStateSpy = vi.spyOn(useAppStore, "setState");
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    view.setUint32(0, 4, true);
    view.setUint32(4, 2, true);

    previewChannel.onmessage(buf);
    previewChannel.onmessage(buf);

    expect(getLatestInputPreviewFrame()).toMatchObject({ width: 4, height: 2 });
    expect(setStateSpy).not.toHaveBeenCalled();
    setStateSpy.mockRestore();
  });
});
