import { describe, expect, it } from "vitest";
import {
  isLanguageLessonActive,
  isLanguageLessonCaptureActive,
  isLanguageLessonSpellingActive,
} from "./isLanguageLessonActive";

const base = {
  musicTeachingEnabled: true,
  teachingLesson: "language" as const,
  settings: { keyboardSectionMode: "synthesizer" },
};

describe("isLanguageLessonActive", () => {
  it("is true only for teaching + synthesizer mode + language lesson", () => {
    expect(isLanguageLessonActive(base)).toBe(true);
    expect(
      isLanguageLessonActive({
        ...base,
        teachingLesson: "music",
      }),
    ).toBe(false);
    expect(
      isLanguageLessonActive({
        ...base,
        musicTeachingEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("isLanguageLessonCaptureActive", () => {
  it("captures only while playing or authoring a list", () => {
    expect(isLanguageLessonCaptureActive(base)).toBe(false);
    expect(
      isLanguageLessonCaptureActive({ ...base, languageLessonPlaying: true }),
    ).toBe(true);
    expect(
      isLanguageLessonCaptureActive({ ...base, languageListAuthoringActive: true }),
    ).toBe(true);
    expect(
      isLanguageLessonCaptureActive({
        ...base,
        languageLessonPlaying: true,
        languageListAuthoringActive: true,
      }),
    ).toBe(true);
  });
});

describe("isLanguageLessonSpellingActive", () => {
  it("spells only while playing and not authoring", () => {
    expect(isLanguageLessonSpellingActive(base)).toBe(false);
    expect(
      isLanguageLessonSpellingActive({ ...base, languageLessonPlaying: true }),
    ).toBe(true);
    expect(
      isLanguageLessonSpellingActive({
        ...base,
        languageLessonPlaying: true,
        languageListAuthoringActive: true,
      }),
    ).toBe(false);
  });
});
