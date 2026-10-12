import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";
import { MODE_MENU_WIDTH, modeMenuHeight } from "../lib/focusMode";
import { APP_MODE_OPTIONS } from "../lib/appModeLayout";

const mockState = vi.hoisted(() => ({
  calls: [] as string[],
  resolveExpand: null as (() => void) | null,
  focusHandlers: new Map<string, (event: { payload: unknown }) => void>(),
  showDictationOverlay: vi.fn(() => Promise.resolve()),
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
  listen: vi.fn(
    (event: string, handler: (event: { payload: unknown }) => void) => {
      mockState.focusHandlers.set(event, handler);
      return Promise.resolve(() => {
        mockState.focusHandlers.delete(event);
      });
    },
  ),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/dictationOverlayWindow", () => ({
  showDictationOverlay: () => mockState.showDictationOverlay(),
  hideDictationOverlay: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "./appStore";

describe("mode menu store actions", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.resolveExpand = null;
    vi.mocked(invoke).mockClear();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: true },
      focusModeActive: false,
      musicTeachingEnabled: false,
      isAnimatingWindow: false,
      modeMenuOpen: false,
    });
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

  it("restores layout on focus loss when only the mode menu is open", () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, micMode: true },
      focusModeActive: true,
      modeMenuOpen: true,
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusModeSuppressAutoShow: false,
      isAnimatingWindow: false,
    });
    mockState.focusHandlers.get("input-focus-changed")?.({
      payload: { focused: false },
    });
    expect(useAppStore.getState().modeMenuOpen).toBe(false);
    expect(mockState.calls).toContain("cmd_animate_window_layout");
  });

  it("repositions the dictation overlay after a focus-mode layout sync", async () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      focusModeActive: true,
      focusModeKeyboardVisible: true,
      dictationState: "listening",
      isAnimatingWindow: false,
    });
    mockState.focusHandlers.get("input-focus-changed")?.({
      payload: { focused: false },
    });
    await vi.waitFor(() =>
      expect(mockState.showDictationOverlay).toHaveBeenCalled(),
    );
  });
});
