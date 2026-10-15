import type { StateCreator } from "zustand";
import type { AppStore, SuggestionsSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  commitSuggestionList,
  suggestionSuffixAfterPrefix,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { commandFailure } from "../../lib/logIpc";
import type { CommandResult } from "../../lib/types";
import { INTERNAL_PROFILE_ID } from "../../lib/types";
import { shouldClearSuggestions, suggestionWordPrefix } from "../../lib/suggestionPrefix";
import { isLanguageLessonActive } from "../../lib/language";

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
    if (isLanguageLessonActive(get())) return;
    const { settings, typedBuffer } = get();
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
      for (let i = 0; i < prefix.length; i++) {
        const r = await invoke<CommandResult>("cmd_press_key", {
          request: { key: "backspace", modifiers: [] },
        });
        if (fail(r)) {
          set({ typedBuffer: previousTypedBuffer });
          return;
        }
      }
      if (
        fail(
          await invoke<CommandResult>("cmd_type_text", { text: word + " " }),
        )
      ) {
        set({ typedBuffer: previousTypedBuffer });
        return;
      }
    }
    await invoke("cmd_record_word", {
      profileId: INTERNAL_PROFILE_ID,
      word,
      language: settings.typingLanguage || "en",
    });
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
