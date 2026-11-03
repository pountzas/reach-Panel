import { afterEach, describe, expect, it, vi } from "vitest";
import { debug as pluginDebug } from "@tauri-apps/plugin-log";
import {
  commandFailure,
  logIpc,
  logLayoutIpc,
  resetLayoutIpcRateLimit,
} from "./logIpc";

describe("logIpc", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a catch handler that console.warns the label and error in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = logIpc("cmd_trackpad_gesture_end");
    const err = new Error("gesture failed");

    handler(err);

    expect(warn).toHaveBeenCalledWith("[ipc] cmd_trackpad_gesture_end", err);
  });

  it("does not log outside development builds", () => {
    vi.stubEnv("DEV", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logIpc("cmd_trackpad_gesture_end")(new Error("gesture failed"));

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("logLayoutIpc", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetLayoutIpcRateLimit();
    vi.mocked(pluginDebug).mockClear();
  });

  it("sends a debug line in all builds and rate-limits to once per second", () => {
    vi.stubEnv("DEV", false);
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const debug = vi.mocked(pluginDebug);

    logLayoutIpc("cmd_apply_window_layout", { heightRatio: 0.5 });
    logLayoutIpc("cmd_apply_window_layout", { heightRatio: 0.6 });

    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0]?.[0]).toContain("cmd_apply_window_layout");
    expect(debug.mock.calls[0]?.[0]).toContain("heightRatio=0.5");

    vi.setSystemTime(2_000);
    logLayoutIpc("cmd_animate_window_layout", { collapsed: true });
    expect(debug).toHaveBeenCalledTimes(2);
    expect(debug.mock.calls[1]?.[0]).toContain("cmd_animate_window_layout");
  });
});

describe("commandFailure", () => {
  it("returns null when the command succeeded", () => {
    expect(commandFailure({ success: true })).toBeNull();
  });

  it("returns the trimmed error message when the command failed", () => {
    expect(commandFailure({ success: false, error: "  boom  " })).toBe("boom");
  });

  it("returns a fallback when the failed command has no message", () => {
    expect(commandFailure({ success: false })).toBe("Command failed");
  });
});
