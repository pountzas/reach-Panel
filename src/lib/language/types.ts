/** Lesson content language — not UI locale. */
export type LessonLanguage = "el" | "en";

export type LanguageAgeBand =
  | "early"
  | "primary"
  | "lower_secondary"
  | "upper_secondary";

export type LanguageSpellTask = {
  type: "spell";
  /** Exact expected answer after normalization. */
  answer: string;
  hint?: string;
  /** 0 = always show; default from age band in later phases. */
  showSeconds?: number;
};

export type LanguageCopyTask = {
  type: "copy";
  answer: string;
  wordAtATime?: boolean;
};

export type LanguageTask = LanguageSpellTask | LanguageCopyTask;

export type LanguagePackSource = "builtin" | "caregiver";

export type LanguagePack = {
  id: string;
  title: string;
  description?: string;
  lessonLanguage: LessonLanguage;
  ageBand: LanguageAgeBand;
  author?: string;
  source?: LanguagePackSource;
  tasks: LanguageTask[];
};

export const DEFAULT_LANGUAGE_AGE_BAND: LanguageAgeBand = "primary";
