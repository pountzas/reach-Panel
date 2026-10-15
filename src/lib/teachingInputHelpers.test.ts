import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import {
  isDictationKeyVisible,
  shouldSuppressLanguageSuggestions,
  teachingHidesInputHelpers,
  teachingInputHelpersEnabled,
} from "./teachingInputHelpers";

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
    expect(
      shouldSuppressLanguageSuggestions(true, DEFAULT_SETTINGS),
    ).toBe(false);
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
});
