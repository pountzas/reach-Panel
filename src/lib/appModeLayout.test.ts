import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import {
  captureModeBeforeCompanion,
  captureWindowHeightRatioBeforeTeaching,
  coercePersistedKeyboardSectionMode,
  heightRatioAfterLeavingTeaching,
  hydrateKeyboardSectionMode,
  isSynthesizerUiActive,
  isTeachingSessionActive,
  lessonCloseAppMode,
  teachingLessonTitleKey,
  needsKeyboardSectionModeMigration,
  restoreModeAfterCompanion,
  restoreWindowHeightRatio,
  resolveSelectedAppMode,
  settingsForPersist,
  shouldDelegateAppModeToMain,
  shouldSyncNonMiniWindowLayout,
  teachingSessionKeyboardMode,
} from "./appModeLayout";

describe("heightRatioAfterLeavingTeaching", () => {
  it("returns undefined for unset / null / Teaching 1.0", () => {
    expect(heightRatioAfterLeavingTeaching("unset")).toBeUndefined();
    expect(heightRatioAfterLeavingTeaching(null)).toBeUndefined();
    expect(heightRatioAfterLeavingTeaching(1.0)).toBeUndefined();
    expect(heightRatioAfterLeavingTeaching(0.999)).toBeUndefined();
  });

  it("returns a normal saved ratio unchanged", () => {
    expect(heightRatioAfterLeavingTeaching(0.7)).toBe(0.7);
  });
});

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
  it("shows the piano only for the Music lesson during Teaching", () => {
    expect(isSynthesizerUiActive(true, "synthesizer", "music")).toBe(true);
    expect(isSynthesizerUiActive(true, "synthesizer", "language")).toBe(false);
    expect(isSynthesizerUiActive(true, "synthesizer", "math")).toBe(false);
    expect(isSynthesizerUiActive(false, "synthesizer", "music")).toBe(false);
    expect(isSynthesizerUiActive(true, "keyboard", "music")).toBe(false);
  });
});

describe("isTeachingSessionActive", () => {
  it("is true for any lesson while Teaching chrome is on", () => {
    expect(isTeachingSessionActive(true, "synthesizer")).toBe(true);
    expect(isTeachingSessionActive(false, "synthesizer")).toBe(false);
    expect(isTeachingSessionActive(true, "keyboard")).toBe(false);
  });
});

describe("teachingLessonTitleKey", () => {
  it("maps each lesson to its section title", () => {
    expect(teachingLessonTitleKey("language")).toBe("languageLessonTitle");
    expect(teachingLessonTitleKey("music")).toBe("musicLesson");
    expect(teachingLessonTitleKey("math")).toBe("mathLessonTitle");
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

describe("hydrateKeyboardSectionMode", () => {
  it("restores synthesizer for a live Teaching session even when disk has keyboard", () => {
    expect(hydrateKeyboardSectionMode("keyboard", true)).toBe("synthesizer");
    expect(hydrateKeyboardSectionMode("synthesizer", true)).toBe("synthesizer");
  });

  it("never hydrates synthesizer when Teaching is off", () => {
    expect(hydrateKeyboardSectionMode("synthesizer", false)).toBe("keyboard");
    expect(hydrateKeyboardSectionMode("keyboard", false)).toBe("keyboard");
  });
});

describe("settingsForPersist", () => {
  it("strips synthesizer so Teaching chrome is session-only on disk", () => {
    const persisted = settingsForPersist({
      ...DEFAULT_SETTINGS,
      keyboardSectionMode: "synthesizer",
    });
    expect(persisted.keyboardSectionMode).toBe("keyboard");
  });

  it("leaves keyboard mode unchanged", () => {
    const persisted = settingsForPersist({
      ...DEFAULT_SETTINGS,
      keyboardSectionMode: "keyboard",
    });
    expect(persisted.keyboardSectionMode).toBe("keyboard");
  });
});

describe("shouldDelegateAppModeToMain", () => {
  it("delegates tablet changes from Settings so main owns the lesson slot", () => {
    expect(shouldDelegateAppModeToMain("settings")).toBe(true);
    expect(shouldDelegateAppModeToMain("macro-builder")).toBe(true);
    expect(shouldDelegateAppModeToMain("main")).toBe(false);
  });
});

describe("teachingSessionKeyboardMode", () => {
  it("maps the live Teaching flag to in-memory keyboard chrome", () => {
    expect(teachingSessionKeyboardMode(true)).toBe("synthesizer");
    expect(teachingSessionKeyboardMode(false)).toBe("keyboard");
  });
});

describe("resolveSelectedAppMode", () => {
  it("prefers companion over teaching and mini", () => {
    expect(
      resolveSelectedAppMode({
        companionModeActive: true,
        teachingActive: true,
        miniModeOverride: true,
      }),
    ).toBe("companion");
  });

  it("prefers teaching over mini when companion is off", () => {
    expect(
      resolveSelectedAppMode({
        companionModeActive: false,
        teachingActive: true,
        miniModeOverride: true,
      }),
    ).toBe("teaching");
  });

  it("selects mini when only mini override is set", () => {
    expect(
      resolveSelectedAppMode({
        companionModeActive: false,
        teachingActive: false,
        miniModeOverride: true,
      }),
    ).toBe("mini");
  });

  it('falls back to "normal" when no overrides are active', () => {
    expect(
      resolveSelectedAppMode({
        companionModeActive: false,
        teachingActive: false,
        miniModeOverride: false,
      }),
    ).toBe("normal");
    expect(
      resolveSelectedAppMode({
        companionModeActive: false,
        teachingActive: false,
        miniModeOverride: undefined,
      }),
    ).toBe("normal");
  });
});

describe("captureModeBeforeCompanion", () => {
  it("captures normal, mini, and teaching host modes", () => {
    expect(captureModeBeforeCompanion("normal")).toBe("normal");
    expect(captureModeBeforeCompanion("mini")).toBe("mini");
    expect(captureModeBeforeCompanion("teaching")).toBe("teaching");
  });

  it("returns null when already on the companion tablet", () => {
    expect(captureModeBeforeCompanion("companion")).toBeNull();
  });
});

describe("restoreModeAfterCompanion", () => {
  it("restores the captured host mode", () => {
    expect(restoreModeAfterCompanion("mini")).toBe("mini");
    expect(restoreModeAfterCompanion("teaching")).toBe("teaching");
    expect(restoreModeAfterCompanion("normal")).toBe("normal");
  });

  it('falls back to "normal" when nothing was captured', () => {
    expect(restoreModeAfterCompanion(null)).toBe("normal");
    expect(restoreModeAfterCompanion(undefined)).toBe("normal");
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
