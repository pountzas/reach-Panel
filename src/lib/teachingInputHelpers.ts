import type { AppSettings } from "./types";

export function teachingInputHelpersEnabled(settings: AppSettings): boolean {
  return settings.showTeachingInputHelpers !== false;
}

export function teachingHidesInputHelpers(
  teachingSessionActive: boolean,
  settings: AppSettings,
): boolean {
  return teachingSessionActive && !teachingInputHelpersEnabled(settings);
}

export function shouldSuppressLanguageSuggestions(
  languageLessonActive: boolean,
  settings: AppSettings,
): boolean {
  return languageLessonActive && !teachingInputHelpersEnabled(settings);
}

export function isDictationKeyVisible(
  settings: AppSettings,
  teachingSessionActive: boolean,
): boolean {
  if (!settings.dictationVisible) return false;
  if (teachingHidesInputHelpers(teachingSessionActive, settings)) return false;
  return true;
}
