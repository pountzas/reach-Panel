import { describe, expect, it } from "vitest";
import {
  captureWindowHeightRatioBeforeTeaching,
  coercePersistedKeyboardSectionMode,
  needsKeyboardSectionModeMigration,
  restoreWindowHeightRatio,
} from "./appModeLayout";

describe("restoreWindowHeightRatio", () => {
  it("returns the captured numeric ratio", () => {
    expect(restoreWindowHeightRatio(0.55)).toBe(0.55);
  });

  it('clears Teaching 1.0 when saved was "unset"', () => {
    expect(restoreWindowHeightRatio("unset")).toBeUndefined();
  });

  it("clears Teaching 1.0 when saved was null", () => {
    expect(restoreWindowHeightRatio(null)).toBeUndefined();
  });
});

describe("captureWindowHeightRatioBeforeTeaching", () => {
  it('records undefined/null as "unset"', () => {
    expect(captureWindowHeightRatioBeforeTeaching(undefined)).toBe("unset");
    expect(captureWindowHeightRatioBeforeTeaching(null)).toBe("unset");
  });

  it("records a finite ratio as-is", () => {
    expect(captureWindowHeightRatioBeforeTeaching(0.7)).toBe(0.7);
  });
});

describe("coercePersistedKeyboardSectionMode", () => {
  it("forces keyboard when Teaching is not active", () => {
    expect(coercePersistedKeyboardSectionMode("synthesizer", false)).toBe(
      "keyboard",
    );
    expect(coercePersistedKeyboardSectionMode("keyboard", false)).toBe(
      "keyboard",
    );
  });

  it("keeps synthesizer only during a live Teaching session", () => {
    expect(coercePersistedKeyboardSectionMode("synthesizer", true)).toBe(
      "synthesizer",
    );
    expect(coercePersistedKeyboardSectionMode("keyboard", true)).toBe(
      "keyboard",
    );
  });
});

describe("needsKeyboardSectionModeMigration", () => {
  it("migrates persisted synthesizer outside Teaching", () => {
    expect(needsKeyboardSectionModeMigration("synthesizer", false)).toBe(true);
  });

  it("does not migrate keyboard or live Teaching synth", () => {
    expect(needsKeyboardSectionModeMigration("keyboard", false)).toBe(false);
    expect(needsKeyboardSectionModeMigration("synthesizer", true)).toBe(false);
  });
});
