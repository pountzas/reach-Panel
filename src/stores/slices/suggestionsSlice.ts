import type { StateCreator } from "zustand";
import type { AppStore, SuggestionsSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  commitSuggestionList,
  suggestionSuffixAfterPrefix,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
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
    const parts = typedBuffer.split(/\s+/);
    const prefix = parts[parts.length - 1] ?? "";
    parts[parts.length - 1] = word;
    const next = parts.join(" ") + " ";
    set({ typedBuffer: next });

    const suffix = suggestionSuffixAfterPrefix(word, prefix);
    if (suffix !== null) {
      await invoke("cmd_type_text", { text: suffix + " " });
    } else {
      for (let i = 0; i < prefix.length; i++) {
        await invoke("cmd_press_key", {
          request: { key: "backspace", modifiers: [] },
        });
      }
      await invoke("cmd_type_text", { text: word + " " });
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
