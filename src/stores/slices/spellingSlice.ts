import type { StateCreator } from "zustand";
import type { AppStore, SpellingSlice } from "../types";
import {
  dropTeachingSuggestionPrefix,
  languageLessonModeFromState,
  greekComposeContextFromState,
  clearGreekPendingAccent,
} from "../storeShared";
import {
  currentSpellAnswer,
  getLanguagePackById,
  isLanguageLessonActive,
  isLanguageLessonSpellingActive,
  languageAnswersMatch,
} from "../../lib/language";
import {
  greekComposeEnabled,
  processCharacterInput,
} from "../../lib/keyboardCharacterInput";

export const createSpellingSlice: StateCreator<
  AppStore,
  [],
  [],
  SpellingSlice
> = (set, get) => ({
  languageTaskIndex: 0,
  languageInputBuffer: "",
  languageAnswerIncorrect: false,
  languageLessonPlaying: false,
  languageListAuthoringActive: false,
  languageListAuthoringField: "title",
  languageListAuthoringHandlers: null,
  restartLanguageLesson: () => {
    set({
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying: false,
      ...clearGreekPendingAccent(),
    });
  },
  startLanguageLessonPlayback: () => {
    const state = get();
    if (!isLanguageLessonActive(languageLessonModeFromState(state))) return;
    const pack = getLanguagePackById(
      state.languagePackId,
      state.customLanguagePacks,
    );
    if (!pack || pack.tasks.length === 0) return;
    set({
      languageLessonPlaying: true,
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      ...clearGreekPendingAccent(),
    });
    void get().syncWindowFocusable();
  },
  stopLanguageLessonPlayback: () => {
    if (!get().languageLessonPlaying) return;
    dropTeachingSuggestionPrefix(set);
    set({ languageLessonPlaying: false });
    void get().syncWindowFocusable();
  },
  setLanguageListAuthoringActive: (active) => {
    set({
      languageListAuthoringActive: active,
      ...(active
        ? {
            languageLessonPlaying: false,
            languageListAuthoringField: "title" as const,
          }
        : {
            languageListAuthoringField: "title" as const,
            languageListAuthoringHandlers: null,
          }),
    });
    void get().syncWindowFocusable();
  },
  setLanguageListAuthoringField: (field) => {
    set({ languageListAuthoringField: field });
  },
  registerLanguageListAuthoringHandlers: (handlers) => {
    set({ languageListAuthoringHandlers: handlers });
  },
  languageKeyInput: (ch, options) => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get())))
      return;

    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = processCharacterInput(
      state.languageInputBuffer,
      state.greekPendingAccent,
      ch,
      { physicalKey: options?.physicalKey, greekCompose: greek },
    );
    set({
      languageInputBuffer: result.buffer,
      greekPendingAccent: result.pendingAccent,
      languageAnswerIncorrect: false,
      typedBuffer: result.buffer,
    });
    void get().loadSuggestions();
  },
  languageBackspace: () => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get())))
      return;
    set((state) => {
      if (state.greekPendingAccent) {
        return {
          ...clearGreekPendingAccent(),
          languageAnswerIncorrect: false,
        };
      }
      const languageInputBuffer = state.languageInputBuffer.slice(0, -1);
      return {
        languageInputBuffer,
        languageAnswerIncorrect: false,
        typedBuffer: languageInputBuffer,
      };
    });
    void get().loadSuggestions();
  },
  checkLanguageAnswer: () => {
    const state = get();
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(state)))
      return;
    const pack = getLanguagePackById(
      state.languagePackId,
      state.customLanguagePacks,
    );
    if (!pack) return;
    const expected = currentSpellAnswer(pack, state.languageTaskIndex);
    if (!expected) return;
    const ignoreCase = state.settings.languageLessonIgnoreCase !== false;
    const ignoreTones = state.settings.languageLessonIgnoreTones !== false;
    if (
      !languageAnswersMatch(
        state.languageInputBuffer,
        expected,
        pack.lessonLanguage,
        { ignoreCase, ignoreTones },
      )
    ) {
      set({ languageAnswerIncorrect: true });
      return;
    }
    set({
      languageTaskIndex: state.languageTaskIndex + 1,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      typedBuffer: "",
      languageLessonPlaying:
        state.languageTaskIndex + 1 >= pack.tasks.length
          ? false
          : state.languageLessonPlaying,
      ...clearGreekPendingAccent(),
    });
    void get().loadSuggestions();
  },
});
