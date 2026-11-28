// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const { logError, invoke } = vi.hoisted(() => ({
  logError: vi.fn(),
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("./log", () => ({
  logError,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

import { registerGlobalErrorHandlers } from "./registerGlobalErrorHandlers";

describe("registerGlobalErrorHandlers", () => {
  afterEach(() => {
    logError.mockReset();
    invoke.mockClear();
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

  it("records a breadcrumb and preventDefault for aborted view-transition rejections", () => {
    registerGlobalErrorHandlers();
    const reason = new DOMException(
      "Transition was aborted because of invalid state. Viewport size changed",
      "InvalidStateError",
    );
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason,
      cancelable: true,
    });
    const prevented = !window.dispatchEvent(event);

    expect(prevented).toBe(true);
    expect(logError).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("cmd_record_breadcrumb", {
      scope: "window",
      message: "view-transition aborted (viewport resize)",
    });
  });
});
