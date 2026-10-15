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

describe("applySuggestion", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    notifyError.mockReset();
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
      },
      typedBuffer: "hel",
      suggestions: ["hello"],
      musicTeachingEnabled: false,
      lastError: null,
    });
  });

  it("surfaces IPC failure from cmd_type_text and does not record the word", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_type_text") {
        return Promise.resolve({ success: false, error: "x" });
      }
      if (cmd === "cmd_get_suggestions") {
        return Promise.resolve([]);
      }
      return Promise.resolve({ success: true });
    });

    await useAppStore.getState().applySuggestion("hello");

    expect(notifyError).toHaveBeenCalledWith("x");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_record_word",
      expect.anything(),
    );
    expect(useAppStore.getState().typedBuffer).toBe("hel");
  });
});
