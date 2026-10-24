import type { LessonLanguage } from "./types";

export type NormalizeLessonTextOptions = {
  ignoreCase?: boolean;
  /** Strip accent marks (Greek tones, combining diacritics) before compare. */
  ignoreTones?: boolean;
};

const TRAILING_PUNCT = /[.!?,;:]+$/u;

/** Curly/smart apostrophes → ASCII apostrophe. */
function normalizeApostrophes(text: string): string {
  return text.replace(/[\u2018\u2019\u02BC]/g, "'");
}

/** NFD then drop combining marks so ά/α and café/cafe can match. */
export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "");
}

/**
 * Normalize lesson input and expected answers for comparison.
 * Greek: NFC + optional tone stripping.
 */
export function normalizeLessonText(
  text: string,
  _lessonLanguage: LessonLanguage,
  options: NormalizeLessonTextOptions = {},
): string {
  const ignoreCase = options.ignoreCase ?? true;
  const ignoreTones = options.ignoreTones ?? true;
  let value = text.normalize("NFC").trim();
  value = normalizeApostrophes(value);
  value = value.replace(TRAILING_PUNCT, "");
  if (ignoreTones) {
    value = stripDiacritics(value);
  }
  if (ignoreCase) {
    value = value.toLocaleLowerCase(_lessonLanguage === "el" ? "el" : "en");
  }
  return value;
}

export function languageAnswersMatch(
  typed: string,
  expected: string,
  lessonLanguage: LessonLanguage,
  options?: NormalizeLessonTextOptions,
): boolean {
  return (
    normalizeLessonText(typed, lessonLanguage, options) ===
    normalizeLessonText(expected, lessonLanguage, options)
  );
}
