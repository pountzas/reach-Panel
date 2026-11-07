// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";

const { invokeMock, logWarn } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  logWarn: vi.fn(),
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

vi.mock("../../lib/log", () => ({
  logWarn,
  logError: vi.fn(),
  logInfo: vi.fn(),
  logDebug: vi.fn(),
  redact: (value: string) => value,
}));

import { useAppStore } from "../appStore";
import { storeFlags } from "../storeFlags";

function resetLiveResizeFlags(): void {
  storeFlags.liveHeightRatioPreview = null;
  storeFlags.liveHeightRatioRaf = null;
  storeFlags.liveHeightRatioPending = null;
  storeFlags.liveHeightRatioInFlight = false;
}

describe("applyWindowHeightRatioLive catch", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    logWarn.mockReset();
    resetLiveResizeFlags();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      return setTimeout(() => {
        cb(0);
      }, 0) as unknown as number;
    });
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: false },
      musicTeachingEnabled: false,
      focusModeActive: false,
      focusModeKeyboardVisible: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetLiveResizeFlags();
  });

  it("logs a rejected cmd_apply_window_layout without serializing settings", async () => {
    const err = new Error("layout apply failed");
    invokeMock.mockRejectedValue(err);

    await useAppStore.getState().applyWindowHeightRatioLive(0.5);

    expect(logWarn).toHaveBeenCalledWith("ipc", "cmd_apply_window_layout", {
      error: err,
    });
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("groqApiKey");
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain(
      "freeWriteNotepadText",
    );
  });

  it("clears the preview so a near-equal retry still invokes", async () => {
    invokeMock.mockRejectedValueOnce(new Error("layout apply failed"));
    invokeMock.mockResolvedValueOnce(undefined);

    await useAppStore.getState().applyWindowHeightRatioLive(0.5);
    expect(storeFlags.liveHeightRatioPreview).toBeNull();

    await useAppStore.getState().applyWindowHeightRatioLive(0.5);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
