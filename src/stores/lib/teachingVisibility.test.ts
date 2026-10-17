import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";
import {
  freeWriteModeFromState,
  languageLessonModeFromState,
  teachingFullWorkAreaActive,
} from "./teachingVisibility";

describe("teachingFullWorkAreaActive", () => {
  it("is true only when teaching is enabled and keyboard mode is synthesizer", () => {
    expect(
      teachingFullWorkAreaActive(
        { ...DEFAULT_SETTINGS, keyboardSectionMode: "synthesizer" },
        true,
      ),
    ).toBe(true);
    expect(
      teachingFullWorkAreaActive(
        { ...DEFAULT_SETTINGS, keyboardSectionMode: "synthesizer" },
        false,
      ),
    ).toBe(false);
    expect(
      teachingFullWorkAreaActive(
        { ...DEFAULT_SETTINGS, keyboardSectionMode: "keyboard" },
        true,
      ),
    ).toBe(false);
  });
});

describe("languageLessonModeFromState", () => {
  it("picks the fields language-lesson capture checks need", () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(
      languageLessonModeFromState({
        musicTeachingEnabled: true,
        teachingLesson: "language",
        settings,
        languageLessonPlaying: true,
        languageListAuthoringActive: false,
        languageSubjectTab: "spelling",
      }),
    ).toEqual({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      settings,
      languageLessonPlaying: true,
      languageListAuthoringActive: false,
      languageSubjectTab: "spelling",
    });
  });
});

describe("freeWriteModeFromState", () => {
  it("picks the fields free-write capture checks need", () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(
      freeWriteModeFromState({
        musicTeachingEnabled: true,
        teachingLesson: "language",
        settings,
        languageSubjectTab: "freeWrite",
        freeWriteFocus: "notepad",
      }),
    ).toEqual({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      settings,
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "notepad",
    });
  });
});
