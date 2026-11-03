import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

const { logWarn } = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock("./log", () => ({
  logWarn,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

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
    logWarn.mockReset();
    vi.useRealTimers();
  });

  it("returns a catch handler that console.warns the label and error in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = logIpc("cmd_trackpad_gesture_end");
    const err = new Error("gesture failed");

    handler(err);

    expect(warn).toHaveBeenCalledWith("[ipc] cmd_trackpad_gesture_end", err);
  });

  it("does not console.warn outside development builds", () => {
    vi.stubEnv("DEV", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logIpc("cmd_trackpad_gesture_end")(new Error("gesture failed"));

    expect(warn).not.toHaveBeenCalled();
  });

  it("logs via logWarn in production builds", () => {
    vi.stubEnv("DEV", false);
    const err = new Error("layout failed");

    logIpc("cmd_apply_window_layout")(err);

    expect(logWarn).toHaveBeenCalledWith("ipc", "cmd_apply_window_layout", {
      error: err,
    });
  });

  it("logs at most one line per second per label and reports suppressed count", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const handler = logIpc("cmd_move_cursor_relative");
    const first = new Error("first");
    const last = new Error("later");

    handler(first);
    handler(new Error("burst-1"));
    handler(new Error("burst-2"));

    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith("ipc", "cmd_move_cursor_relative", {
      error: first,
    });

    vi.advanceTimersByTime(1000);
    handler(last);

    expect(logWarn).toHaveBeenCalledWith("ipc", "cmd_move_cursor_relative", {
      suppressed: 2,
    });
    expect(logWarn).toHaveBeenCalledWith("ipc", "cmd_move_cursor_relative", {
      error: last,
    });
  });
});

describe("logLayoutIpc", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetLayoutIpcRateLimit();
    vi.mocked(invoke).mockClear();
  });

  it("records a breadcrumb in all builds and rate-limits to once per second", () => {
    vi.stubEnv("DEV", false);
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    logLayoutIpc("cmd_apply_window_layout", { heightRatio: 0.5 });
    logLayoutIpc("cmd_apply_window_layout", { heightRatio: 0.6 });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("cmd_record_breadcrumb", {
      scope: "layout-ipc",
      message: 'cmd_apply_window_layout {"heightRatio":0.5}',
    });

    vi.setSystemTime(2_000);
    logLayoutIpc("cmd_animate_window_layout", { collapsed: true });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith("cmd_record_breadcrumb", {
      scope: "layout-ipc",
      message: 'cmd_animate_window_layout {"collapsed":true}',
    });
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
