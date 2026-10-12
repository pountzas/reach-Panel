// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";

const mockState = vi.hoisted(() => ({
  calls: [] as string[],
  applyArgs: [] as Array<Record<string, unknown>>,
  applyGate: null as Promise<void> | null,
  inputFocusHandler: null as
    | ((event: { payload: { focused: boolean } }) => void)
    | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    mockState.calls.push(cmd);
    if (cmd === "cmd_apply_window_layout") {
      mockState.applyArgs.push(args ?? {});
      if (mockState.applyGate) {
        return mockState.applyGate;
      }
    }
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (event: unknown) => void) => {
    if (event === "input-focus-changed") {
      mockState.inputFocusHandler = handler as (event: {
        payload: { focused: boolean };
      }) => void;
    }
    return Promise.resolve(() => {});
  }),
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
    mockState.applyArgs.length = 0;
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

  it("uses the shared saved windowHeightRatio for focus keyboard height (no fixed snap)", async () => {
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        micMode: false,
        windowHeightRatio: 0.7,
      },
    });
    const expand = useAppStore.getState().expandFocusModeKeyboard();
    await vi.waitFor(() => {
      expect(mockState.applyArgs.length).toBeGreaterThan(0);
    });
    const args = mockState.applyArgs[mockState.applyArgs.length - 1];
    expect(args.focusMode).toBe(true);
    expect(args.focusKeyboardVisible).toBe(true);
    expect(args.focusKeyboardHeightRatio).toBe(0.7);
    expect(args.heightRatio).toBe(0.7);
    notifyFocusContentAnimDone();
    await expand;
  });

  it("marks isAnimatingWindow in the same turn as showing the keyboard", async () => {
    let releaseApply!: () => void;
    mockState.applyGate = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });
    const expand = useAppStore.getState().expandFocusModeKeyboard();
    expect(useAppStore.getState().focusModeKeyboardVisible).toBe(true);
    expect(useAppStore.getState().isAnimatingWindow).toBe(true);
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
    // Paint flush runs before apply so FAB is not stretched on resize.
    expect(mockState.calls).not.toContain("cmd_apply_window_layout");
    await vi.waitFor(() => {
      expect(mockState.calls).toContain("cmd_apply_window_layout");
    });
    releaseApply();
    await vi.waitFor(() => {
      expect(useAppStore.getState().focusContentAnim).toBe("enter");
    });
    notifyFocusContentAnimDone();
    await expand;
  });

  it("sets content enter after applying window layout on expand", async () => {
    let releaseApply!: () => void;
    mockState.applyGate = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });
    const expand = useAppStore.getState().expandFocusModeKeyboard();
    await vi.waitFor(() => {
      expect(mockState.calls).toContain("cmd_apply_window_layout");
    });
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
    expect(useAppStore.getState().isAnimatingWindow).toBe(true);
    expect(useAppStore.getState().focusModeKeyboardVisible).toBe(true);
    releaseApply();
    await vi.waitFor(() => {
      expect(useAppStore.getState().focusContentAnim).toBe("enter");
    });
    notifyFocusContentAnimDone();
    await expand;
    expect(useAppStore.getState().focusContentAnim).toBe("idle");
  });

  it("sets exit and isAnimatingWindow in the same turn as hiding the keyboard", async () => {
    useAppStore.setState({
      focusModeKeyboardVisible: true,
      focusModeManualExpand: true,
    });
    const collapse = useAppStore.getState().collapseFocusModeKeyboard();
    expect(useAppStore.getState().focusModeKeyboardVisible).toBe(false);
    expect(useAppStore.getState().isAnimatingWindow).toBe(true);
    expect(useAppStore.getState().focusContentAnim).toBe("exit");
    notifyFocusContentAnimDone();
    await collapse;
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

  it("does not apply a stale collapsed layout when focus returns during collapse exit", async () => {
    await vi.waitFor(() => {
      expect(mockState.inputFocusHandler).toBeTruthy();
    });
    useAppStore.setState({
      focusModeKeyboardVisible: true,
      focusModeManualExpand: false,
      focusModeSuppressAutoShow: false,
    });
    // Focus-lost collapse (continueHeld) — not collapseFocusModeKeyboard (suppress).
    mockState.inputFocusHandler!({ payload: { focused: false } });
    await vi.waitFor(() => {
      expect(useAppStore.getState().focusContentAnim).toBe("exit");
    });
    expect(mockState.applyArgs).toHaveLength(0);

    mockState.inputFocusHandler!({ payload: { focused: true } });
    expect(useAppStore.getState().focusModeKeyboardVisible).toBe(true);

    notifyFocusContentAnimDone();
    await vi.waitFor(() => {
      expect(useAppStore.getState().isAnimatingWindow).toBe(false);
    });
    // Enter may still be waiting after the queued expand sync starts.
    if (useAppStore.getState().focusContentAnim === "enter") {
      notifyFocusContentAnimDone();
    }
    await vi.waitFor(() => {
      expect(useAppStore.getState().isAnimatingWindow).toBe(false);
      expect(useAppStore.getState().focusContentAnim).toBe("idle");
    });

    expect(
      mockState.applyArgs.some(
        (a) => a.collapsed === true && a.focusKeyboardVisible === false,
      ),
    ).toBe(false);
    expect(mockState.applyArgs[mockState.applyArgs.length - 1]).toMatchObject({
      collapsed: false,
      focusKeyboardVisible: true,
    });
    expect(useAppStore.getState().focusModeKeyboardVisible).toBe(true);
  });
});
