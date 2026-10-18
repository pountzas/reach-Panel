import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { emptyPdfAnnotationDoc } from "../../lib/teaching";
import {
  selectedPdfTextBoxBody,
  teachingSuggestionSourceText,
} from "./teachingSuggestions";

describe("teachingSuggestionSourceText", () => {
  it("returns the spelling buffer while a lesson is playing", () => {
    expect(
      teachingSuggestionSourceText({
        musicTeachingEnabled: true,
        teachingLesson: "language",
        languageSubjectTab: "spelling",
        languageLessonPlaying: true,
        languageListAuthoringActive: false,
        languageInputBuffer: "hel",
        freeWriteFocus: "notepad",
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        settings: {
          ...DEFAULT_SETTINGS,
          keyboardSectionMode: "synthesizer",
          freeWriteNotepadText: "ignored",
        },
      }),
    ).toBe("hel");
  });

  it("returns notepad text in Free write notepad focus", () => {
    expect(
      teachingSuggestionSourceText({
        musicTeachingEnabled: true,
        teachingLesson: "language",
        languageSubjectTab: "freeWrite",
        languageLessonPlaying: false,
        languageListAuthoringActive: false,
        languageInputBuffer: "ignored",
        freeWriteFocus: "notepad",
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        settings: {
          ...DEFAULT_SETTINGS,
          keyboardSectionMode: "synthesizer",
          freeWriteNotepadText: "note",
        },
      }),
    ).toBe("note");
  });

  it("returns the selected PDF text box body", () => {
    expect(
      teachingSuggestionSourceText({
        musicTeachingEnabled: true,
        teachingLesson: "language",
        languageSubjectTab: "freeWrite",
        languageLessonPlaying: false,
        languageListAuthoringActive: false,
        languageInputBuffer: "",
        freeWriteFocus: "pdfText",
        freeWriteSelectedTextId: "t1",
        freeWriteAnnotationDoc: {
          schemaVersion: 1,
          pages: {
            "1": {
              strokes: [],
              texts: [{ id: "t1", x: 0, y: 0, w: 40, body: "pdf" }],
            },
          },
        },
        settings: {
          ...DEFAULT_SETTINGS,
          keyboardSectionMode: "synthesizer",
        },
      }),
    ).toBe("pdf");
  });

  it("returns null outside Teaching capture", () => {
    expect(
      teachingSuggestionSourceText({
        musicTeachingEnabled: false,
        teachingLesson: "language",
        languageSubjectTab: "spelling",
        languageLessonPlaying: true,
        languageListAuthoringActive: false,
        languageInputBuffer: "hel",
        freeWriteFocus: "notepad",
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        settings: DEFAULT_SETTINGS,
      }),
    ).toBeNull();
  });
});

describe("selectedPdfTextBoxBody", () => {
  it("finds the box by id across pages", () => {
    expect(
      selectedPdfTextBoxBody(
        {
          schemaVersion: 1,
          pages: {
            "2": {
              strokes: [],
              texts: [{ id: "x", x: 0, y: 0, w: 10, body: "found" }],
            },
          },
        },
        "x",
      ),
    ).toBe("found");
  });

  it("returns empty when id is missing", () => {
    expect(selectedPdfTextBoxBody(emptyPdfAnnotationDoc(), null)).toBe("");
  });
});
