import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { greekComposeContextFromState } from "./greekComposeFromState";

const baseState = {
  settings: {
    ...DEFAULT_SETTINGS,
    keyboardSectionMode: "synthesizer" as const,
    languageLessonLanguage: "el" as const,
  },
  keyboardLayout: "QWERTY",
  musicTeachingEnabled: true,
  teachingLesson: "language" as const,
  languagePackId: "el-spell-primary-01" as string | null,
  customLanguagePacks: [],
  languageLessonPlaying: false,
  languageListAuthoringActive: false,
  languageSubjectTab: "spelling" as const,
};

describe("greekComposeContextFromState", () => {
  it("sets languageLessonActive only when capture is active", () => {
    expect(
      greekComposeContextFromState(baseState).languageLessonActive,
    ).toBe(false);
    expect(
      greekComposeContextFromState({
        ...baseState,
        languageLessonPlaying: true,
      }).languageLessonActive,
    ).toBe(true);
    expect(
      greekComposeContextFromState({
        ...baseState,
        languageListAuthoringActive: true,
      }).languageLessonActive,
    ).toBe(true);
  });

  it("uses lessonLanguage from pack when available", () => {
    expect(
      greekComposeContextFromState(baseState).lessonLanguage,
    ).toBe("el");
  });

  it("falls back to settings.languageLessonLanguage without a pack", () => {
    expect(
      greekComposeContextFromState({
        ...baseState,
        languagePackId: null,
        settings: {
          ...baseState.settings,
          languageLessonLanguage: "en",
        },
      }).lessonLanguage,
    ).toBe("en");
  });
});
