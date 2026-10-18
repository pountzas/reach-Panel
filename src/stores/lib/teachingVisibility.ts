import type { AppSettings } from "../../lib/types";
import type { FreeWriteFocus, LanguageSubjectTab } from "../../lib/teaching";
import { isTeachingFullWorkArea } from "../../lib/v1HiddenFeatures";
import type { TeachingLesson } from "../types";

export function teachingFullWorkAreaActive(
  settings: AppSettings,
  musicTeachingEnabled: boolean,
): boolean {
  return isTeachingFullWorkArea({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });
}

export function languageLessonModeFromState(state: {
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  settings: AppSettings;
  languageLessonPlaying: boolean;
  languageListAuthoringActive: boolean;
  languageSubjectTab: LanguageSubjectTab;
}) {
  return {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    settings: state.settings,
    languageLessonPlaying: state.languageLessonPlaying,
    languageListAuthoringActive: state.languageListAuthoringActive,
    languageSubjectTab: state.languageSubjectTab,
  };
}

export function freeWriteModeFromState(state: {
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  settings: AppSettings;
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
}) {
  return {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    settings: state.settings,
    languageSubjectTab: state.languageSubjectTab,
    freeWriteFocus: state.freeWriteFocus,
  };
}
