export type LanguageSubjectTab = "spelling" | "freeWrite";
export type FreeWriteFocus = "notepad" | "pdf";

export type FreeWriteModeInput = {
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
  settings: { keyboardSectionMode?: string };
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
};

export function isLanguageSubjectActive(input: FreeWriteModeInput): boolean {
  return (
    input.musicTeachingEnabled &&
    input.settings.keyboardSectionMode === "synthesizer" &&
    input.teachingLesson === "language"
  );
}

export function isLanguageSpellingTabActive(input: FreeWriteModeInput): boolean {
  return isLanguageSubjectActive(input) && input.languageSubjectTab === "spelling";
}

/** Capture for Free write notepad (v1: notepad focus only; PDF uses native field focus when available). */
export function isFreeWriteCaptureActive(input: FreeWriteModeInput): boolean {
  return (
    isLanguageSubjectActive(input) &&
    input.languageSubjectTab === "freeWrite" &&
    input.freeWriteFocus === "notepad"
  );
}
