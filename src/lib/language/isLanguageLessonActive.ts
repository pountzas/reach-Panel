export type LanguageLessonModeInput = {
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
  settings: { keyboardSectionMode?: string };
  languageLessonPlaying?: boolean;
  languageListAuthoringActive?: boolean;
};

export function isLanguageLessonActive(input: LanguageLessonModeInput): boolean {
  return (
    input.musicTeachingEnabled &&
    input.settings.keyboardSectionMode === "synthesizer" &&
    input.teachingLesson === "language"
  );
}

/** Keyboard capture for spelling (Play) or caregiver list authoring. */
export function isLanguageLessonCaptureActive(input: LanguageLessonModeInput): boolean {
  if (!isLanguageLessonActive(input)) return false;
  if (input.languageListAuthoringActive) return true;
  return Boolean(input.languageLessonPlaying);
}

/** Spelling buffer updates while the lesson is playing (not while authoring). */
export function isLanguageLessonSpellingActive(input: LanguageLessonModeInput): boolean {
  return (
    isLanguageLessonActive(input) &&
    Boolean(input.languageLessonPlaying) &&
    !input.languageListAuthoringActive
  );
}
