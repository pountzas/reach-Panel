import type { AppSettings } from "../../lib/types";
import { defaultLanguagePackId, getLanguagePackById } from "../../lib/language";
import type { LanguagePack, LessonLanguage } from "../../lib/language/types";
import { DEFAULT_LANGUAGE_AGE_BAND } from "../../lib/language/types";
import type { GreekPendingAccent } from "../../lib/language/greekCompose";
import type {
  LanguageListAuthoringField,
  LanguageListAuthoringHandlers,
} from "../types";

export function emptyLanguageLessonState() {
  return {
    languagePackId: null as string | null,
    languageTaskIndex: 0,
    languageInputBuffer: "",
    languageAnswerIncorrect: false,
    languageLessonPlaying: false,
    languageListAuthoringActive: false,
    languageListAuthoringField: "title" as LanguageListAuthoringField,
    languageListAuthoringHandlers: null as LanguageListAuthoringHandlers | null,
  };
}

export function initLanguageLessonState(
  settings: AppSettings,
  languagePackId: string | null,
  extraPacks: LanguagePack[] = [],
) {
  const band = settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
  const lessonLanguage: LessonLanguage =
    settings.languageLessonLanguage ??
    (settings.typingLanguage === "en" ? "en" : "el");
  const resolvedId =
    languagePackId && getLanguagePackById(languagePackId, extraPacks)
      ? languagePackId
      : defaultLanguagePackId(band, lessonLanguage);
  return {
    languagePackId: resolvedId,
    languageTaskIndex: 0,
    languageInputBuffer: "",
    languageAnswerIncorrect: false,
  };
}

export function teachingPdfFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function clearGreekPendingAccent() {
  return { greekPendingAccent: null as GreekPendingAccent | null };
}
