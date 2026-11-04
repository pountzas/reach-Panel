// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const { logError } = vi.hoisted(() => ({
  logError: vi.fn(),
}));

vi.mock("./log", () => ({
  logError,
}));

import { registerGlobalErrorHandlers } from "./registerGlobalErrorHandlers";

describe("registerGlobalErrorHandlers", () => {
  afterEach(() => {
    logError.mockReset();
  });

  it("logs an uncaught error with message, source, and stack, not the event target", () => {
    registerGlobalErrorHandlers();
    const input = document.createElement("input");
    input.value = "typed secret";
    document.body.appendChild(input);
    const err = new Error("uncaught boom");
    err.stack = "Error: uncaught boom\n    at handler";

    const event = new ErrorEvent("error", {
      message: "uncaught boom",
      filename: "app.js",
      lineno: 12,
      colno: 4,
      error: err,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });
    window.dispatchEvent(event);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "window",
      "uncaught boom",
      expect.objectContaining({
        source: "app.js:12:4",
        error: err,
      }),
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain("typed secret");
  });

  it("logs an unhandled rejection with the reason and window-scoped fields only", () => {
    registerGlobalErrorHandlers();
    const reason = new Error("promise failed");
    reason.stack = "Error: promise failed\n    at async work";
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason,
    });
    window.dispatchEvent(event);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "window",
      "Unhandled rejection",
      expect.objectContaining({ error: reason }),
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain("typed secret");
  });
});
