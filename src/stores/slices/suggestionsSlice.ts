import type { StateCreator } from "zustand";
import type { AppStore, SuggestionsSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  commitSuggestionList,
  suggestionSuffixAfterPrefix,
} from "../storeShared";
import {
  freeWriteModeFromState,
  languageLessonModeFromState,
} from "../lib/teachingVisibility";
import { replaceTrailingWord } from "../lib/suggestionMerge";
import { selectedPdfTextBoxBody } from "../lib/teachingSuggestions";
import { invoke } from "@tauri-apps/api/core";
import { commandFailure, logIpc } from "../../lib/logIpc";
import type { CommandResult } from "../../lib/types";
import { INTERNAL_PROFILE_ID } from "../../lib/types";
import {
  shouldClearSuggestions,
  suggestionWordPrefix,
} from "../../lib/suggestionPrefix";
import { isLanguageLessonActive } from "../../lib/language";
import {
  clonePdfAnnotationDoc,
  isFreeWriteCaptureActive,
  isLanguageSubjectActive,
} from "../../lib/teaching";

export const createSuggestionsSlice: StateCreator<
  AppStore,
  [],
  [],
  SuggestionsSlice
> = (set, get) => ({
  suggestions: [],
  loadSuggestions: async () => {
    const { settings, typedBuffer } = get();
    if (!settings.suggestionsVisible || !settings.predictionEnabled) {
      storeFlags.suggestionsRequestId += 1;
      commitSuggestionList(set, []);
      return;
    }
    const prefix = suggestionWordPrefix(typedBuffer);
    if (shouldClearSuggestions(typedBuffer)) {
      storeFlags.suggestionsRequestId += 1;
      commitSuggestionList(set, []);
      return;
    }
    const requestId = ++storeFlags.suggestionsRequestId;
    const results = await invoke<{ word: string }[]>("cmd_get_suggestions", {
      profileId: INTERNAL_PROFILE_ID,
      prefix,
      language: settings.typingLanguage || "en",
    });
    if (requestId !== storeFlags.suggestionsRequestId) {
      return;
    }
    if (shouldClearSuggestions(get().typedBuffer)) {
      commitSuggestionList(set, []);
      return;
    }
    commitSuggestionList(
      set,
      results.map((r) => r.word),
    );
  },
  applySuggestion: async (word) => {
    const state = get();
    if (state.languageListAuthoringActive) return;

    // Free write notepad / PDF text: never inject into the external focused window.
    if (isFreeWriteCaptureActive(freeWriteModeFromState(state))) {
      if (state.freeWriteFocus === "pdfText") {
        const textId = state.freeWriteSelectedTextId;
        if (!textId) return;
        const text = selectedPdfTextBoxBody(
          state.freeWriteAnnotationDoc,
          textId,
        );
        const next = replaceTrailingWord(text, word, true);
        get().applyFreeWriteAnnotationUpdater(
          (doc) => {
            const updated = clonePdfAnnotationDoc(doc);
            for (const page of Object.values(updated.pages)) {
              const box = page.texts.find((t) => t.id === textId);
              if (box) {
                box.body = next;
                break;
              }
            }
            return updated;
          },
          { pushUndo: false },
        );
        set({ typedBuffer: next });
        await invoke("cmd_record_word", {
          profileId: INTERNAL_PROFILE_ID,
          word,
          language: state.settings.typingLanguage || "en",
        }).catch(logIpc("cmd_record_word"));
        await get().loadSuggestions();
        return;
      }
      const text = state.settings.freeWriteNotepadText ?? "";
      const next = replaceTrailingWord(text, word, true);
      set({
        typedBuffer: next,
        settings: { ...state.settings, freeWriteNotepadText: next },
      });
      void get().updateSettings({ freeWriteNotepadText: next });
      await invoke("cmd_record_word", {
        profileId: INTERNAL_PROFILE_ID,
        word,
        language: state.settings.typingLanguage || "en",
      }).catch(logIpc("cmd_record_word"));
      await get().loadSuggestions();
      return;
    }

    // Spelling tab: write into the lesson buffer (not OS focus).
    if (isLanguageLessonActive(languageLessonModeFromState(state))) {
      const next = replaceTrailingWord(state.languageInputBuffer, word, false);
      set({
        languageInputBuffer: next,
        typedBuffer: `${next} `,
        languageAnswerIncorrect: false,
      });
      await invoke("cmd_record_word", {
        profileId: INTERNAL_PROFILE_ID,
        word,
        language: state.settings.typingLanguage || "en",
      }).catch(logIpc("cmd_record_word"));
      await get().loadSuggestions();
      return;
    }

    // Teaching Language with no in-app capture target: never inject into the OS.
    if (isLanguageSubjectActive(freeWriteModeFromState(state))) {
      return;
    }

    const { settings, typedBuffer } = state;
    const previousTypedBuffer = typedBuffer;
    const parts = typedBuffer.split(/\s+/);
    const prefix = parts[parts.length - 1] ?? "";
    parts[parts.length - 1] = word;
    const next = parts.join(" ") + " ";
    set({ typedBuffer: next });

    const fail = (result: CommandResult): boolean => {
      const failure = commandFailure(result);
      if (failure) get().setLastError(failure);
      return failure !== null;
    };

    const suffix = suggestionSuffixAfterPrefix(word, prefix);
    if (suffix !== null) {
      if (
        fail(
          await invoke<CommandResult>("cmd_type_text", { text: suffix + " " }),
        )
      ) {
        set({ typedBuffer: previousTypedBuffer });
        return;
      }
    } else {
      let deleted = 0;
      const rollback = () => { set({
          typedBuffer: previousTypedBuffer.slice(
            0,
            previousTypedBuffer.length - deleted,
          ),
        }); };
      while (deleted < prefix.length) {
        const r = await invoke<CommandResult>("cmd_press_key", {
          request: { key: "backspace", modifiers: [] },
        });
        if (fail(r)) {
          rollback();
          return;
        }
        deleted += 1;
      }
      if (
        fail(await invoke<CommandResult>("cmd_type_text", { text: word + " " }))
      ) {
        rollback();
        return;
      }
    }
    await invoke("cmd_record_word", {
      profileId: INTERNAL_PROFILE_ID,
      word,
      language: settings.typingLanguage || "en",
    }).catch(logIpc("cmd_record_word"));
    await get().loadSuggestions();
  },
  recordTypedWord: async () => {
    const { settings, typedBuffer } = get();
    if (!settings.suggestionsVisible || !settings.predictionEnabled) return;
    const parts = typedBuffer.trimEnd().split(/\s+/);
    const word = parts[parts.length - 1] ?? "";
    if (word.length < 2) return;
    if (!/^[\p{L}][\p{L}'’-]*$/u.test(word)) return;
    await invoke("cmd_record_word", {
      profileId: INTERNAL_PROFILE_ID,
      word,
      language: settings.typingLanguage || "en",
    });
  },
});
