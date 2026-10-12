// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";
import { MODE_MENU_WIDTH, modeMenuHeight } from "../lib/focusMode";
import { APP_MODE_OPTIONS } from "../lib/appModeLayout";

const mockState = vi.hoisted(() => ({
  calls: [] as string[],
  resolveExpand: null as (() => void) | null,
}));

const motionMocks = vi.hoisted(() => ({
  prefersReducedMotion: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    mockState.calls.push(cmd);
    if (cmd === "cmd_expand_window_for_mode_menu") {
      return new Promise<void>((r) => {
        mockState.resolveExpand = () => {
          mockState.calls.push("expand:done");
          r();
        };
      });
    }
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
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: motionMocks.prefersReducedMotion,
}));

import { invoke } from "@tauri-apps/api/core";
import { MOTION } from "../lib/motion";
import { useAppStore } from "./appStore";

describe("mode menu store actions", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.resolveExpand = null;
    motionMocks.prefersReducedMotion.mockReturnValue(false);
    vi.mocked(invoke).mockClear();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: true },
      focusModeActive: false,
      musicTeachingEnabled: false,
      isAnimatingWindow: false,
      modeMenuOpen: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("openModeMenu invokes expand with the shared menu size", async () => {
    const open = useAppStore.getState().openModeMenu();
    expect(useAppStore.getState().modeMenuOpen).toBe(true);
    expect(invoke).toHaveBeenCalledWith("cmd_expand_window_for_mode_menu", {
      menuWidth: MODE_MENU_WIDTH,
      menuHeight: modeMenuHeight(1 + APP_MODE_OPTIONS.length),
    });
    mockState.resolveExpand?.();
    await open;
    expect(mockState.calls).toContain("expand:done");
  });

  it("closeModeMenu waits for an in-flight expand before restoring layout", async () => {
    const open = useAppStore.getState().openModeMenu();
    expect(
      mockState.calls.filter((c) => c === "cmd_expand_window_for_mode_menu"),
    ).toHaveLength(1);

    const close = useAppStore.getState().closeModeMenu();
    expect(useAppStore.getState().modeMenuOpen).toBe(false);
    expect(mockState.calls.includes("cmd_apply_window_layout")).toBe(false);

    mockState.resolveExpand?.();
    await open;
    await close;

    expect(mockState.calls).toContain("expand:done");
    expect(mockState.calls).toContain("cmd_apply_window_layout");
  });

  it("closeModeMenu skips restore when menu reopened during exit wait", async () => {
    vi.useFakeTimers();
    const open = useAppStore.getState().openModeMenu();
    mockState.resolveExpand?.();
    await open;

    const close = useAppStore.getState().closeModeMenu();
    const reopen = useAppStore.getState().openModeMenu();
    expect(useAppStore.getState().modeMenuOpen).toBe(true);

    await vi.advanceTimersByTimeAsync(MOTION.fast);
    mockState.resolveExpand?.();
    await close;
    await reopen;

    expect(mockState.calls.includes("cmd_apply_window_layout")).toBe(false);
  });

  it("closeModeMenu waits MOTION.fast before restoring layout when motion is allowed", async () => {
    vi.useFakeTimers();
    const open = useAppStore.getState().openModeMenu();
    mockState.resolveExpand?.();
    await open;

    const close = useAppStore.getState().closeModeMenu();
    expect(mockState.calls.includes("cmd_apply_window_layout")).toBe(false);

    await vi.advanceTimersByTimeAsync(MOTION.fast - 1);
    expect(mockState.calls.includes("cmd_apply_window_layout")).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await close;
    expect(mockState.calls).toContain("cmd_apply_window_layout");
  });

  it("closeModeMenu restores layout immediately when prefersReducedMotion", async () => {
    motionMocks.prefersReducedMotion.mockReturnValue(true);
    const open = useAppStore.getState().openModeMenu();
    mockState.resolveExpand?.();
    await open;

    await useAppStore.getState().closeModeMenu();
    expect(mockState.calls).toContain("cmd_apply_window_layout");
  });

  it("openModeMenu clears modeMenuOpen when expand fails", async () => {
    vi.mocked(invoke).mockImplementationOnce((cmd: string) => {
      mockState.calls.push(cmd);
      if (cmd === "cmd_expand_window_for_mode_menu") {
        return Promise.reject(new Error("expand failed"));
      }
      return Promise.resolve(undefined);
    });

    await useAppStore.getState().openModeMenu();
    expect(useAppStore.getState().modeMenuOpen).toBe(false);
  });
});
