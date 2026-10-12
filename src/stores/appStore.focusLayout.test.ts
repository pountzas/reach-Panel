// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";

const mockState = vi.hoisted(() => ({
  calls: [] as string[],
  applyGate: null as Promise<void> | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    mockState.calls.push(cmd);
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    if (cmd === "cmd_apply_window_layout" && mockState.applyGate) {
      return mockState.applyGate;
    }
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

import { invoke } from "@tauri-apps/api/core";
import { notifyFocusContentAnimDone, useAppStore } from "./appStore";

describe("focus mode window layout", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.applyGate = null;
    vi.mocked(invoke).mockClear();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, micMode: false },
      focusModeActive: true,
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusContentAnim: "idle",
      musicTeachingEnabled: false,
      isAnimatingWindow: false,
      modeMenuOpen: false,
    });
  });

  it("expanding the keyboard applies layout once and never animates the native window", async () => {
    const expand = useAppStore.getState().expandFocusModeKeyboard();
    await vi.waitFor(() => {
      expect(mockState.calls).toContain("cmd_apply_window_layout");
    });
    expect(mockState.calls.filter((c) => c === "cmd_apply_window_layout")).toHaveLength(
      1,
    );
    expect(mockState.calls).not.toContain("cmd_animate_window_layout");
    notifyFocusContentAnimDone();
    await expand;
  });

  it("sets content enter before applying window layout on expand", async () => {
    let releaseApply!: () => void;
    mockState.applyGate = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });
    const expand = useAppStore.getState().expandFocusModeKeyboard();
    await vi.waitFor(() => {
      expect(mockState.calls).toContain("cmd_apply_window_layout");
    });
    expect(useAppStore.getState().focusContentAnim).toBe("enter");
    expect(useAppStore.getState().focusModeKeyboardVisible).toBe(true);
    notifyFocusContentAnimDone();
    releaseApply();
    await expand;
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
  });

  it("waits for content enter, then returns to idle when notified", async () => {
    const expand = useAppStore.getState().expandFocusModeKeyboard();
    await vi.waitFor(() => {
      expect(useAppStore.getState().focusContentAnim).toBe("enter");
    });
    expect(mockState.calls).toContain("cmd_apply_window_layout");
    notifyFocusContentAnimDone();
    await expand;
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
    expect(useAppStore.getState().isAnimatingWindow).toBe(false);
  });

  it("collapses after content exit, applying layout once without native window animation", async () => {
    useAppStore.setState({
      focusModeKeyboardVisible: true,
      focusModeManualExpand: true,
    });
    const collapse = useAppStore.getState().collapseFocusModeKeyboard();
    await vi.waitFor(() => {
      expect(useAppStore.getState().focusContentAnim).toBe("exit");
    });
    expect(mockState.calls).not.toContain("cmd_apply_window_layout");
    notifyFocusContentAnimDone();
    await collapse;
    expect(mockState.calls).toContain("cmd_apply_window_layout");
    expect(mockState.calls.filter((c) => c === "cmd_apply_window_layout")).toHaveLength(
      1,
    );
    expect(mockState.calls).not.toContain("cmd_animate_window_layout");
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
  });

  it("skips content animation and still applies layout when motion is reduced", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await useAppStore.getState().expandFocusModeKeyboard();
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
    expect(mockState.calls).toContain("cmd_apply_window_layout");
    expect(mockState.calls).not.toContain("cmd_animate_window_layout");
    vi.unstubAllGlobals();
  });
});
