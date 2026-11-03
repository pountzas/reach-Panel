import { describe, expect, it } from "vitest";
import { redact, serializeError } from "./log";

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
