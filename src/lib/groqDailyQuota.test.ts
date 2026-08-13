import { describe, expect, it } from "vitest";
import {
  localDateKey,
  msUntilNextLocalMidnight,
  remainingPercent,
  shouldShowQuotaBadge,
  type GroqDailyQuotaSnapshot,
} from "./groqDailyQuota";

describe("remainingPercent", () => {
  it("rounds remaining RPD percent", () => {
    expect(remainingPercent(50, 100)).toBe(50);
    expect(remainingPercent(1, 3)).toBe(33);
    expect(remainingPercent(2, 3)).toBe(67);
  });

  it("clamps to 0–100", () => {
    expect(remainingPercent(0, 100)).toBe(0);
    expect(remainingPercent(100, 100)).toBe(100);
    expect(remainingPercent(150, 100)).toBe(100);
    expect(remainingPercent(-5, 100)).toBe(0);
  });

  it("returns 0 when limit is not positive", () => {
    expect(remainingPercent(10, 0)).toBe(0);
    expect(remainingPercent(10, -1)).toBe(0);
  });
});

describe("shouldShowQuotaBadge", () => {
  const snap: GroqDailyQuotaSnapshot = {
    date: "2026-08-13",
    remainingRequests: 40,
    limitRequests: 50,
  };

  it("hides when engine is not groq", () => {
    expect(shouldShowQuotaBadge(snap, "2026-08-13", "winrt")).toBe(false);
    expect(shouldShowQuotaBadge(snap, "2026-08-13", null)).toBe(false);
  });

  it("hides when there is no snapshot", () => {
    expect(shouldShowQuotaBadge(null, "2026-08-13", "groq")).toBe(false);
  });

  it("hides when stored date is not today", () => {
    expect(shouldShowQuotaBadge(snap, "2026-08-14", "groq")).toBe(false);
  });

  it("shows when groq and stored date matches today", () => {
    expect(shouldShowQuotaBadge(snap, "2026-08-13", "groq")).toBe(true);
  });
});

describe("localDateKey", () => {
  it("formats local YYYY-MM-DD", () => {
    expect(localDateKey(new Date(2026, 7, 13))).toBe("2026-08-13");
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("returns 1000ms one second before local midnight", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 7, 13, 23, 59, 59, 0))).toBe(
      1000,
    );
  });

  it("returns a full day at local midnight", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 7, 13, 0, 0, 0, 0))).toBe(
      86_400_000,
    );
  });

  it("returns at least 1ms when already past midnight boundary", () => {
    expect(
      msUntilNextLocalMidnight(new Date(2026, 7, 13, 23, 59, 59, 999)),
    ).toBeGreaterThanOrEqual(1);
  });
});
