import { describe, expect, it } from "vitest";
import {
  captureWindowHeightRatioBeforeTeaching,
  coercePersistedKeyboardSectionMode,
  isSynthesizerUiActive,
  lessonCloseAppMode,
  needsKeyboardSectionModeMigration,
  restoreWindowHeightRatio,
  shouldSyncNonMiniWindowLayout,
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

describe("isSynthesizerUiActive", () => {
  it("requires both Teaching and synthesizer section", () => {
    expect(isSynthesizerUiActive(true, "synthesizer")).toBe(true);
    expect(isSynthesizerUiActive(false, "synthesizer")).toBe(false);
    expect(isSynthesizerUiActive(true, "keyboard")).toBe(false);
    expect(isSynthesizerUiActive(false, "keyboard")).toBe(false);
  });
});

describe("lessonCloseAppMode", () => {
  it("restores the tablet captured before Teaching", () => {
    expect(lessonCloseAppMode("mini")).toBe("mini");
    expect(lessonCloseAppMode("normal")).toBe("normal");
  });

  it('falls back to "normal" when nothing was captured', () => {
    expect(lessonCloseAppMode(null)).toBe("normal");
    expect(lessonCloseAppMode(undefined)).toBe("normal");
  });
});

describe("shouldSyncNonMiniWindowLayout", () => {
  it("syncs non-mini when only accessibilityMonitorId changes", () => {
    expect(
      shouldSyncNonMiniWindowLayout({
        miniModeActive: false,
        accessibilityMonitorIdInPatch: true,
        windowHeightRatioInPatch: false,
        keyboardSectionModeInPatch: false,
      }),
    ).toBe(true);
  });

  it("does not sync non-mini layout while Mini is active", () => {
    expect(
      shouldSyncNonMiniWindowLayout({
        miniModeActive: true,
        accessibilityMonitorIdInPatch: true,
        windowHeightRatioInPatch: false,
        keyboardSectionModeInPatch: false,
      }),
    ).toBe(false);
  });

  it("syncs for height or section changes when not Mini", () => {
    expect(
      shouldSyncNonMiniWindowLayout({
        miniModeActive: false,
        accessibilityMonitorIdInPatch: false,
        windowHeightRatioInPatch: true,
        keyboardSectionModeInPatch: false,
      }),
    ).toBe(true);
    expect(
      shouldSyncNonMiniWindowLayout({
        miniModeActive: false,
        accessibilityMonitorIdInPatch: false,
        windowHeightRatioInPatch: false,
        keyboardSectionModeInPatch: true,
      }),
    ).toBe(true);
  });
});
