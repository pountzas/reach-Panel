import { describe, expect, it } from "vitest";
import { languageAnswersMatch, normalizeLessonText } from "./normalize";

describe("normalizeLessonText", () => {
  it("strips trailing punctuation", () => {
    expect(normalizeLessonText("λέξη.", "el", { ignoreTones: false })).toBe("λέξη");
    expect(normalizeLessonText("hello!", "en")).toBe("hello");
  });

  it("ignores case by default", () => {
    expect(normalizeLessonText("Hello", "en")).toBe("hello");
    expect(languageAnswersMatch("Hello", "hello", "en")).toBe(true);
  });

  it("respects ignoreCase: false", () => {
    expect(
      languageAnswersMatch("Hello", "hello", "en", { ignoreCase: false }),
    ).toBe(false);
  });

  it("normalizes apostrophe variants", () => {
    expect(languageAnswersMatch("don't", "don't", "en")).toBe(true);
    expect(languageAnswersMatch("don't", "don't", "en")).toBe(true);
  });

  it("matches Greek with NFC normalization", () => {
    expect(languageAnswersMatch("λέξη", "λέξη", "el")).toBe(true);
  });

  it("ignores Greek tones by default", () => {
    expect(languageAnswersMatch("γατα", "γάτα", "el")).toBe(true);
    expect(languageAnswersMatch("ωρα", "ώρα", "el")).toBe(true);
  });

  it("requires tones when ignoreTones is false", () => {
    expect(
      languageAnswersMatch("γατα", "γάτα", "el", { ignoreTones: false }),
    ).toBe(false);
    expect(
      languageAnswersMatch("γάτα", "γάτα", "el", { ignoreTones: false }),
    ).toBe(true);
  });
});
