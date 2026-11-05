// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../../lib/types";

const windowFns = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  unminimize: vi.fn(async () => {}),
}));

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
    getCurrent: () => ({
      label: "main",
      minimize: windowFns.minimize,
      unminimize: windowFns.unminimize,
    }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

import { useAppStore } from "../appStore";
import { peekRestore } from "../lib/restoreStack";

const invokeMock = vi.mocked(invoke);

describe("applyCompanionSessionPhase FAB", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    windowFns.minimize.mockClear();
    windowFns.unminimize.mockClear();
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        collapsed: false,
        focusModeOverride: false,
        micMode: false,
        keyboardSectionMode: "keyboard",
      },
      settingsEpoch: 1,
      profileHydrated: true,
      musicTeachingEnabled: false,
      restoreStack: [],
      companionBridgeArmed: false,
      companionModeActive: false,
      companionSessionLive: false,
      focusModeActive: false,
      isAnimatingWindow: false,
      monitors: [],
    });
  });

  it("active records collapsed false and enters FAB", async () => {
    await useAppStore.getState().applyCompanionSessionPhase("active");
    const state = useAppStore.getState();
    expect(state.settings.collapsed).toBe(true);
    expect(state.companionSessionLive).toBe(true);
    expect(peekRestore(state.restoreStack, "companion")).toEqual({
      mode: "normal",
      collapsed: false,
    });
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });

  it("idle restores previous mode and expanded state", async () => {
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().applyCompanionSessionPhase("idle");
    const state = useAppStore.getState();
    expect(state.settings.collapsed).toBe(false);
    expect(state.companionSessionLive).toBe(false);
    expect(state.companionModeActive).toBe(false);
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });

  it("idle leaves FAB if it was already collapsed", async () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, collapsed: true },
    });
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().applyCompanionSessionPhase("idle");
    expect(useAppStore.getState().settings.collapsed).toBe(true);
    expect(windowFns.minimize).not.toHaveBeenCalled();
  });

  it("setAppMode('normal') after expanded session restores expanded layout", async () => {
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().setAppMode("normal");
    const state = useAppStore.getState();
    expect(state.settings.collapsed).toBe(false);
    expect(state.companionSessionLive).toBe(false);
    expect(state.companionModeActive).toBe(false);
    expect(state.companionBridgeArmed).toBe(false);
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });

  it("stopCompanionByCaregiver restores expanded after an expanded session", async () => {
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().stopCompanionByCaregiver();
    const state = useAppStore.getState();
    expect(state.settings.collapsed).toBe(false);
    expect(state.companionSessionLive).toBe(false);
    expect(state.companionModeActive).toBe(false);
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });

  it("setAppMode('normal') after already-collapsed session stays collapsed", async () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, collapsed: true },
    });
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().setAppMode("normal");
    expect(useAppStore.getState().settings.collapsed).toBe(true);
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });
});
