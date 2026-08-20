import { describe, expect, it } from "vitest";
import {
  isFreeWriteCaptureActive,
  isLanguageSpellingTabActive,
} from "./isFreeWriteCaptureActive";

const base = {
  musicTeachingEnabled: true,
  teachingLesson: "language" as const,
  settings: { keyboardSectionMode: "synthesizer" },
  languageSubjectTab: "freeWrite" as const,
  freeWriteFocus: "notepad" as const,
};

describe("isFreeWriteCaptureActive", () => {
  it("is true on Language + Free write + notepad focus", () => {
    expect(isFreeWriteCaptureActive(base)).toBe(true);
  });

  it("is false on Spelling tab", () => {
    expect(
      isFreeWriteCaptureActive({ ...base, languageSubjectTab: "spelling" }),
    ).toBe(false);
  });

  it("is false when Music subject", () => {
    expect(isFreeWriteCaptureActive({ ...base, teachingLesson: "music" })).toBe(false);
  });
});

describe("isLanguageSpellingTabActive", () => {
  it("requires language + spelling tab", () => {
    expect(
      isLanguageSpellingTabActive({
        ...base,
        languageSubjectTab: "spelling",
      }),
    ).toBe(true);
    expect(isLanguageSpellingTabActive(base)).toBe(false);
  });
});
