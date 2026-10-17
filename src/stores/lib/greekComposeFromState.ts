import type { AppSettings } from "../../lib/types";
import {
  getLanguagePackById,
  isLanguageLessonCaptureActive,
} from "../../lib/language";
import type { LanguagePack } from "../../lib/language/types";
import type { GreekComposeContext } from "../../lib/keyboardCharacterInput";
import type { LanguageSubjectTab } from "../../lib/teaching";
import type { TeachingLesson } from "../types";

export function greekComposeContextFromState(state: {
  settings: AppSettings;
  keyboardLayout: string;
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  languagePackId: string | null;
  customLanguagePacks: LanguagePack[];
  languageLessonPlaying?: boolean;
  languageListAuthoringActive?: boolean;
  languageSubjectTab?: LanguageSubjectTab;
}): GreekComposeContext {
  const pack = getLanguagePackById(
    state.languagePackId,
    state.customLanguagePacks,
  );
  return {
    typingLanguage: state.settings.typingLanguage,
    keyboardLayout: state.keyboardLayout,
    languageLessonActive: isLanguageLessonCaptureActive({
      musicTeachingEnabled: state.musicTeachingEnabled,
      teachingLesson: state.teachingLesson,
      settings: state.settings,
      languageLessonPlaying: state.languageLessonPlaying,
      languageListAuthoringActive: state.languageListAuthoringActive,
      languageSubjectTab: state.languageSubjectTab ?? "spelling",
    }),
    lessonLanguage:
      pack?.lessonLanguage ?? state.settings.languageLessonLanguage,
  };
}
