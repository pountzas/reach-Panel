import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";
import {
  emptyLanguageLessonState,
  initLanguageLessonState,
  teachingPdfFileName,
} from "./teachingLessonState";

describe("emptyLanguageLessonState", () => {
  it("clears pack, buffers, playback, and authoring", () => {
    expect(emptyLanguageLessonState()).toMatchObject({
      languagePackId: null,
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying: false,
      languageListAuthoringActive: false,
      languageListAuthoringHandlers: null,
    });
  });
});

describe("initLanguageLessonState", () => {
  it("keeps a valid existing pack id", () => {
    const id = initLanguageLessonState(
      { ...DEFAULT_SETTINGS, languageLessonLanguage: "el" },
      "el-spell-primary-01",
      [],
    ).languagePackId;
    expect(id).toBe("el-spell-primary-01");
  });

  it("falls back when pack id is missing", () => {
    const state = initLanguageLessonState(
      {
        ...DEFAULT_SETTINGS,
        languageLessonLanguage: "el",
        typingLanguage: "el",
      },
      null,
    );
    expect(state.languagePackId).toBeTruthy();
    expect(state.languageTaskIndex).toBe(0);
    expect(state.languageInputBuffer).toBe("");
  });
});

describe("teachingPdfFileName", () => {
  it("returns the last path segment for win and posix paths", () => {
    expect(teachingPdfFileName("C:\\Books\\a.pdf")).toBe("a.pdf");
    expect(teachingPdfFileName("/tmp/a.pdf")).toBe("a.pdf");
  });
});
