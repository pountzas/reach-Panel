import { describe, expect, it } from "vitest";
import { isLanguageLessonActive } from "./isLanguageLessonActive";

describe("isLanguageLessonActive", () => {
  it("is true only for teaching + synthesizer mode + language lesson", () => {
    expect(
      isLanguageLessonActive({
        musicTeachingEnabled: true,
        teachingLesson: "language",
        settings: { keyboardSectionMode: "synthesizer" },
      }),
    ).toBe(true);
    expect(
      isLanguageLessonActive({
        musicTeachingEnabled: true,
        teachingLesson: "music",
        settings: { keyboardSectionMode: "synthesizer" },
      }),
    ).toBe(false);
    expect(
      isLanguageLessonActive({
        musicTeachingEnabled: false,
        teachingLesson: "language",
        settings: { keyboardSectionMode: "synthesizer" },
      }),
    ).toBe(false);
  });
});
