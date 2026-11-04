// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const pluginLog = vi.hoisted(() => ({
  error: vi.fn(async () => undefined),
  warn: vi.fn(async () => undefined),
  info: vi.fn(async () => undefined),
  debug: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-log", () => pluginLog);
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getCurrent: () => ({ label: "main" }) },
}));

import { logError, redact, serializeError } from "./log";

describe("redact", () => {
  it("replaces a Groq API key with gsk_***", () => {
    expect(redact("Authorization: Bearer gsk_abc123XYZ")).toBe(
      "Authorization: Bearer gsk_***",
    );
  });

  it("leaves text without a Groq key unchanged", () => {
    expect(redact("transcript len=12")).toBe("transcript len=12");
  });

  it("redacts every Groq key in a string", () => {
    expect(redact("gsk_one then gsk_two")).toBe("gsk_*** then gsk_***");
  });
});

describe("logError", () => {
  it("does not surface a rejected plugin-log call as an unhandled rejection", async () => {
    pluginLog.error.mockRejectedValueOnce(new Error("ipc down"));
    const unhandled: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => {
      unhandled.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    logError("scope", "message");
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.removeEventListener("unhandledrejection", onUnhandled);
    expect(unhandled).toEqual([]);
  });
});

describe("serializeError", () => {
  it("includes Error name, message, and stack", () => {
    const err = new Error("mic stream failed");
    err.name = "TypeError";
    err.stack = "TypeError: mic stream failed\n    at worker_loop";
    expect(serializeError(err)).toBe(
      "TypeError: mic stream failed\n    at worker_loop",
    );
  });

  it("redacts Groq keys in the error message", () => {
    const err = new Error("401 for gsk_live_supersecret");
    err.name = "Error";
    err.stack = undefined;
    expect(serializeError(err)).toBe("Error: 401 for gsk_***");
  });

  it("stringifies non-Error values", () => {
    expect(serializeError("boom")).toBe("boom");
    expect(serializeError(404)).toBe("404");
  });
});
