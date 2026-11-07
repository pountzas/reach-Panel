// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../../lib/types";

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
      minimize: vi.fn(async () => {}),
      unminimize: vi.fn(async () => {}),
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

const invokeMock = vi.mocked(invoke);

function layoutInvokes() {
  return invokeMock.mock.calls.filter(
    ([cmd]) =>
      cmd === "cmd_apply_window_layout" || cmd === "cmd_animate_window_layout",
  );
}

describe("setCollapsed", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: false },
      settingsEpoch: 1,
      profileHydrated: true,
      isAnimatingWindow: false,
      musicTeachingEnabled: false,
      focusModeActive: false,
      modeMenuOpen: false,
    });
  });

  it("setCollapsed(true) while already collapsed does not invoke layout IPC", async () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: true },
    });
    await useAppStore.getState().setCollapsed(true);
    expect(layoutInvokes()).toEqual([]);
    expect(useAppStore.getState().settings.collapsed).toBe(true);
  });

  it("toggleCollapsed still flips expanded to collapsed", async () => {
    await useAppStore.getState().toggleCollapsed();
    expect(useAppStore.getState().settings.collapsed).toBe(true);
    expect(layoutInvokes().length).toBeGreaterThan(0);
  });
});
