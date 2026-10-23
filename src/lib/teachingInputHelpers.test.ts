import { describe, expect, it } from "vitest";
import type { AppSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import {
  computeTeachingChromeVisibility,
  isDictationKeyVisible,
  shouldStopDictationForVisibility,
  shouldSuppressLanguageSuggestions,
  teachingHidesInputHelpers,
  teachingInputHelpersEnabled,
} from "./teachingInputHelpers";

const visibleSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  suggestionsVisible: true,
  inputPreviewVisible: true,
  dictationVisible: true,
  showTeachingInputHelpers: true,
};

function chrome(
  overrides: {
    teachingSessionActive?: boolean;
    showSynth?: boolean;
    compact?: boolean;
    companionSessionLive?: boolean;
    languageLessonActive?: boolean;
    focusModeActive?: boolean;
    settings?: AppSettings;
  } = {},
) {
  return computeTeachingChromeVisibility({
    teachingSessionActive: false,
    showSynth: false,
    compact: false,
    companionSessionLive: false,
    languageLessonActive: false,
    focusModeActive: false,
    settings: visibleSettings,
    ...overrides,
  });
}

describe("teachingInputHelpers", () => {
  it("defaults helpers to enabled when setting is missing", () => {
    expect(teachingInputHelpersEnabled(DEFAULT_SETTINGS)).toBe(true);
    expect(
      teachingInputHelpersEnabled({
        ...DEFAULT_SETTINGS,
        showTeachingInputHelpers: undefined,
      }),
    ).toBe(true);
  });

  it("hides helpers only when Teaching is active and setting is false", () => {
    const off = { ...DEFAULT_SETTINGS, showTeachingInputHelpers: false };
    expect(teachingHidesInputHelpers(false, off)).toBe(false);
    expect(teachingHidesInputHelpers(true, DEFAULT_SETTINGS)).toBe(false);
    expect(teachingHidesInputHelpers(true, off)).toBe(true);
  });

  it("does not suppress language suggestions when helpers are on", () => {
    expect(shouldSuppressLanguageSuggestions(true, DEFAULT_SETTINGS)).toBe(
      false,
    );
    expect(
      shouldSuppressLanguageSuggestions(true, {
        ...DEFAULT_SETTINGS,
        showTeachingInputHelpers: false,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLanguageSuggestions(false, {
        ...DEFAULT_SETTINGS,
        showTeachingInputHelpers: false,
      }),
    ).toBe(false);
  });

  it("hides dictation key when Teaching helpers are off", () => {
    expect(isDictationKeyVisible(DEFAULT_SETTINGS, true)).toBe(true);
    expect(
      isDictationKeyVisible(
        { ...DEFAULT_SETTINGS, dictationVisible: false },
        true,
      ),
    ).toBe(false);
    expect(
      isDictationKeyVisible(
        { ...DEFAULT_SETTINGS, showTeachingInputHelpers: false },
        true,
      ),
    ).toBe(false);
    expect(
      isDictationKeyVisible(
        { ...DEFAULT_SETTINGS, showTeachingInputHelpers: false },
        false,
      ),
    ).toBe(true);
  });

  describe("computeTeachingChromeVisibility", () => {
    it("shows preview, suggestions, and mic outside Teaching when Visible Sections allow them", () => {
      expect(chrome()).toEqual({
        showInputPreview: true,
        showSuggestions: true,
        dictationKeyVisible: true,
      });
    });

    it("never shows live preview in Teaching even when helpers stay on", () => {
      expect(chrome({ teachingSessionActive: true })).toEqual({
        showInputPreview: false,
        showSuggestions: true,
        dictationKeyVisible: true,
      });
    });

    it("hides preview, suggestions, and mic when Teaching is on and helpers are off", () => {
      expect(
        chrome({
          teachingSessionActive: true,
          settings: { ...visibleSettings, showTeachingInputHelpers: false },
        }),
      ).toEqual({
        showInputPreview: false,
        showSuggestions: false,
        dictationKeyVisible: false,
      });
    });

    it("does not hide chrome for helpers-off when Teaching is inactive", () => {
      expect(
        chrome({
          settings: { ...visibleSettings, showTeachingInputHelpers: false },
        }),
      ).toEqual({
        showInputPreview: true,
        showSuggestions: true,
        dictationKeyVisible: true,
      });
    });

    it("hides preview and suggestions for compact even when Teaching helpers are on", () => {
      expect(chrome({ teachingSessionActive: true, compact: true })).toEqual({
        showInputPreview: false,
        showSuggestions: false,
        dictationKeyVisible: true,
      });
    });

    it("hides preview and suggestions for synth even when Teaching helpers are on", () => {
      expect(chrome({ teachingSessionActive: true, showSynth: true })).toEqual({
        showInputPreview: false,
        showSuggestions: false,
        dictationKeyVisible: true,
      });
    });

    it("keeps suggestions during a language spelling lesson when helpers are on", () => {
      expect(
        chrome({
          teachingSessionActive: true,
          languageLessonActive: true,
        }),
      ).toEqual({
        showInputPreview: false,
        showSuggestions: true,
        dictationKeyVisible: true,
      });
    });

    it("hides suggestions during a language spelling lesson when helpers are off", () => {
      expect(
        chrome({
          teachingSessionActive: true,
          languageLessonActive: true,
          settings: { ...visibleSettings, showTeachingInputHelpers: false },
        }),
      ).toEqual({
        showInputPreview: false,
        showSuggestions: false,
        dictationKeyVisible: false,
      });
    });

    it("respects Visible Sections flags independently", () => {
      expect(
        chrome({
          settings: { ...visibleSettings, suggestionsVisible: false },
        }),
      ).toEqual({
        showInputPreview: true,
        showSuggestions: false,
        dictationKeyVisible: true,
      });
      expect(
        chrome({
          settings: { ...visibleSettings, inputPreviewVisible: false },
        }),
      ).toEqual({
        showInputPreview: false,
        showSuggestions: true,
        dictationKeyVisible: true,
      });
      expect(
        chrome({
          settings: { ...visibleSettings, dictationVisible: false },
        }),
      ).toEqual({
        showInputPreview: true,
        showSuggestions: true,
        dictationKeyVisible: false,
      });
    });

    it("hides preview during a live companion session without dropping suggestions", () => {
      expect(chrome({ companionSessionLive: true })).toEqual({
        showInputPreview: false,
        showSuggestions: true,
        dictationKeyVisible: true,
      });
    });
  });

  describe("shouldStopDictationForVisibility", () => {
    it("stops when the mic key is hidden and dictation is listening", () => {
      expect(shouldStopDictationForVisibility(false, "listening")).toBe(true);
    });

    it("stops when the mic key is hidden and dictation is processing", () => {
      expect(shouldStopDictationForVisibility(false, "processing")).toBe(true);
    });

    it("does not stop when the mic key is visible", () => {
      expect(shouldStopDictationForVisibility(true, "listening")).toBe(false);
      expect(shouldStopDictationForVisibility(true, "processing")).toBe(false);
      expect(shouldStopDictationForVisibility(true, "idle")).toBe(false);
    });

    it("does not stop when dictation is already idle", () => {
      expect(shouldStopDictationForVisibility(false, "idle")).toBe(false);
    });
  });

  describe("suggestions row reservation", () => {
    it("keeps showSuggestions true outside Teaching with zero chips when suggestions are on", () => {
      expect(
        chrome({
          teachingSessionActive: false,
          focusModeActive: false,
          settings: { ...visibleSettings, suggestionsVisible: true },
        }).showSuggestions,
      ).toBe(true);
    });

    it("hides suggestions when Settings turns them off", () => {
      expect(
        chrome({
          teachingSessionActive: false,
          focusModeActive: false,
          settings: { ...visibleSettings, suggestionsVisible: false },
        }).showSuggestions,
      ).toBe(false);
    });
  });
});
