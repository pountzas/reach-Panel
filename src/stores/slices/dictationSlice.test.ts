// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";

const { invokeMock, notifyError } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, ...rest: unknown[]) => {
    if (cmd === "cmd_get_input_focused") {
      return Promise.resolve(false);
    }
    return invokeMock(cmd, ...rest);
  },
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

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

vi.mock("../../lib/notify", () => ({
  notify: { error: (...args: unknown[]) => notifyError(...args) },
}));

import { useAppStore } from "../appStore";
import { storeFlags } from "../storeFlags";
import { DICTATION_SELECT_INPUT_ERROR } from "../../lib/dictationErrors";

describe("toggleDictation launches Windows Voice typing", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    notifyError.mockReset();
    storeFlags.lastAnnouncedError = null;
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      externalInputFocused: false,
      lastError: null,
    });
  });

  it("does not send Win+H and toasts when no external field is focused", async () => {
    await useAppStore.getState().toggleDictation();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_launch_windows_voice_typing",
    );
    expect(notifyError).toHaveBeenCalledWith(DICTATION_SELECT_INPUT_ERROR);
  });

  it("asks the host to refocus and send Win+H when a field is focused", async () => {
    invokeMock.mockResolvedValue({ success: true, error: null });
    useAppStore.setState({ externalInputFocused: true });
    await useAppStore.getState().toggleDictation();
    expect(invokeMock).toHaveBeenCalledWith("cmd_launch_windows_voice_typing");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("surfaces a host error and does not treat it as success", async () => {
    invokeMock.mockResolvedValue({
      success: false,
      error: "Companion tablet is connected. Use the tablet mic for dictation.",
    });
    useAppStore.setState({ externalInputFocused: true });
    await useAppStore.getState().toggleDictation();
    expect(useAppStore.getState().lastError).toBe(
      "Companion tablet is connected. Use the tablet mic for dictation.",
    );
  });
});
