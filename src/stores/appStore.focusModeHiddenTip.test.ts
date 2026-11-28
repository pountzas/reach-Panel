// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";

const mockState = vi.hoisted(() => ({
  calls: [] as { cmd: string; args?: Record<string, unknown> }[],
  dismissed: false,
  inputFocusHandler: null as
    ((event: { payload: { focused: boolean } }) => void) | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    mockState.calls.push({ cmd, args });
    if (cmd === "cmd_get_focus_mode_hidden_tip_dismissed") {
      return Promise.resolve(mockState.dismissed);
    }
    if (cmd === "cmd_set_focus_mode_hidden_tip_dismissed") {
      mockState.dismissed = Boolean(args?.dismissed);
      return Promise.resolve(undefined);
    }
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (event: unknown) => void) => {
    if (event === "input-focus-changed") {
      mockState.inputFocusHandler = handler;
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

describe("focus mode hidden tip", () => {
  beforeEach(() => {
    mockState.calls.length = 0;
    mockState.dismissed = false;
    vi.mocked(invoke).mockClear();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, micMode: false },
      focusModeActive: true,
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusContentAnim: "idle",
      isAnimatingWindow: false,
      modeMenuOpen: false,
      showSettings: false,
      focusModeHiddenTipDismissed: false,
      focusModeHiddenTipVisible: false,
      focusModeHiddenTipArmed: false,
    });
  });

  it("arms the tip after focus-lost collapse when the keyboard was visible", async () => {
    await vi.waitFor(() => {
      expect(mockState.inputFocusHandler).toBeTruthy();
    });
    useAppStore.setState({ focusModeKeyboardVisible: true });
    const handler = mockState.inputFocusHandler;
    if (handler == null) throw new Error("expected input-focus handler");
    handler({ payload: { focused: false } });
    await vi.waitFor(() => {
      expect(useAppStore.getState().focusModeHiddenTipArmed).toBe(true);
    });
    notifyFocusContentAnimDone();
  });

  it("does not arm the tip after manual collapseFocusModeKeyboard", async () => {
    useAppStore.setState({ focusModeKeyboardVisible: true });
    await useAppStore.getState().collapseFocusModeKeyboard();
    expect(useAppStore.getState().focusModeHiddenTipArmed).toBe(false);
    notifyFocusContentAnimDone();
  });

  it("does not arm the tip in Mic mode", async () => {
    await vi.waitFor(() => {
      expect(mockState.inputFocusHandler).toBeTruthy();
    });
    useAppStore.setState({
      focusModeKeyboardVisible: true,
      settings: { ...DEFAULT_SETTINGS, micMode: true },
    });
    const handler = mockState.inputFocusHandler;
    if (handler == null) throw new Error("expected input-focus handler");
    handler({ payload: { focused: false } });
    expect(useAppStore.getState().focusModeHiddenTipArmed).toBe(false);
  });

  it("presents the tip once settled and expands the window overlay", async () => {
    useAppStore.setState({
      focusModeHiddenTipArmed: true,
      focusModeKeyboardVisible: false,
      isAnimatingWindow: false,
    });
    await useAppStore.getState().presentFocusModeHiddenTip();
    expect(useAppStore.getState().focusModeHiddenTipVisible).toBe(true);
    expect(
      mockState.calls.some((c) => c.cmd === "cmd_expand_window_for_mode_menu"),
    ).toBe(true);
  });

  it("does not present when install-level dismissed flag is set", async () => {
    useAppStore.setState({
      focusModeHiddenTipArmed: true,
      focusModeHiddenTipDismissed: true,
    });
    await useAppStore.getState().presentFocusModeHiddenTip();
    expect(useAppStore.getState().focusModeHiddenTipVisible).toBe(false);
  });

  it("does not present while Settings is open", async () => {
    useAppStore.setState({
      focusModeHiddenTipArmed: true,
      showSettings: true,
    });
    await useAppStore.getState().presentFocusModeHiddenTip();
    expect(useAppStore.getState().focusModeHiddenTipVisible).toBe(false);
  });

  it("dismiss with persist writes install prefs and restores collapsed layout", async () => {
    useAppStore.setState({ focusModeHiddenTipVisible: true });
    await useAppStore.getState().dismissFocusModeHiddenTip({ persist: true });
    expect(
      mockState.calls.some(
        (c) =>
          c.cmd === "cmd_set_focus_mode_hidden_tip_dismissed" &&
          c.args?.dismissed === true,
      ),
    ).toBe(true);
    expect(useAppStore.getState().focusModeHiddenTipVisible).toBe(false);
    expect(useAppStore.getState().focusModeHiddenTipDismissed).toBe(true);
  });

  it("hiding for mode menu does not persist dismissed", async () => {
    useAppStore.setState({ focusModeHiddenTipVisible: true });
    await useAppStore.getState().dismissFocusModeHiddenTip({ persist: false });
    expect(
      mockState.calls.some(
        (c) => c.cmd === "cmd_set_focus_mode_hidden_tip_dismissed",
      ),
    ).toBe(false);
    expect(useAppStore.getState().focusModeHiddenTipDismissed).toBe(false);
  });
});
