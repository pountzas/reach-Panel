import { afterEach, describe, expect, it, vi } from "vitest";
import { commandFailure, logIpc } from "./logIpc";

describe("logIpc", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a catch handler that console.warns the label and error in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = logIpc("cmd_trackpad_gesture_end");
    const err = new Error("gesture failed");

    handler(err);

    expect(warn).toHaveBeenCalledWith("[ipc] cmd_trackpad_gesture_end", err);
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
