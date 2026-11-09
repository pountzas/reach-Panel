// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PHYSICAL_KEY_STATE } from "../../lib/keyboardLayouts";

vi.mock("@tauri-apps/api/core", () => ({
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
  WebviewWindow: { getCurrent: () => ({ label: "main" }) },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../appStore";

describe("capture CapsLock", () => {
  beforeEach(() => {
    useAppStore.setState({
      physicalKeyState: { ...DEFAULT_PHYSICAL_KEY_STATE, capsLock: false },
      captureCapsLock: false,
    });
    vi.mocked(invoke).mockReset();
  });

  it("survives a keyboard poll that reports OS Caps off", async () => {
    vi.mocked(invoke).mockResolvedValue({
      ...useAppStore.getState().physicalKeyState,
      capsLock: false,
    });

    useAppStore.getState().toggleCaptureCapsLock();
    await useAppStore.getState().pollKeyboardState();

    expect(useAppStore.getState().captureCapsLock).toBe(true);
    expect(useAppStore.getState().physicalKeyState.capsLock).toBe(false);
  });
});
