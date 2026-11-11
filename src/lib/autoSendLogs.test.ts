import { describe, expect, it } from "vitest";
import { shouldAutoSend } from "./autoSendLogs";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-09T00:00:00.000Z");

describe("shouldAutoSend", () => {
  it("does not send when disabled even if upload is configured", () => {
    expect(
      shouldAutoSend({
        enabled: false,
        configured: true,
        lastSuccessAt: null,
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("does not send when upload is unconfigured", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: false,
        lastSuccessAt: null,
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("sends when enabled, configured, and there is no previous success", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: null,
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(true);
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: undefined,
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("does not send when last success was 6 days 23 hours ago", () => {
    const sixDaysTwentyThreeHoursMs =
      6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000;
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: new Date(NOW - sixDaysTwentyThreeHoursMs).toISOString(),
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("sends when last success was exactly 7 days ago", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: new Date(NOW - WEEK_MS).toISOString(),
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("does not send when last success was one millisecond short of 7 days", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: new Date(NOW - (WEEK_MS - 1)).toISOString(),
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("sends when lastSuccessAt is a non-empty unparseable string", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: "not-a-date",
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("sends when lastSuccessAt is in the future", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: new Date(NOW + 60_000).toISOString(),
        lastAttemptAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("does not send when the last attempt was 1 h ago even with no success", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: null,
        lastAttemptAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("sends when the last attempt was 6 h ago", () => {
    expect(
      shouldAutoSend({
        enabled: true,
        configured: true,
        lastSuccessAt: null,
        lastAttemptAt: new Date(NOW - 6 * 60 * 60 * 1000).toISOString(),
        now: NOW,
      }),
    ).toBe(true);
  });
});
