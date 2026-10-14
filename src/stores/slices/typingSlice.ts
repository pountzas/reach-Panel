import type { StateCreator } from "zustand";
import type { AppStore, TypingSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  commitSuggestionList,
  LANGUAGE_CHANGE_FALLBACK,
  physicalKeyStateEqual,
  persistSettingsIfCurrent,
  greekComposeContextFromState,
  languageLessonModeFromState,
  clearGreekPendingAccent,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { DEFAULT_PHYSICAL_KEY_STATE } from "../../lib/keyboardLayouts";
import type { InputMethod, LayoutKeyLabel, PhysicalKeyState } from "../../lib/keyboardLayouts";
import { CommandResult } from "../../lib/types";
import { notify } from "../../lib/notify";
import { shouldClearSuggestions } from "../../lib/suggestionPrefix";
import { PROFILE_UPDATED_EVENT } from "../../lib/toolWindows";
import { isLanguageLessonSpellingActive } from "../../lib/language";
import { greekComposeEnabled, processCharacterInput } from "../../lib/keyboardCharacterInput";
import { applyGreekLayoutTranslation } from "../../lib/layoutKeyTranslation";

export const createTypingSlice: StateCreator<
  AppStore,
  [],
  [],
  TypingSlice
> = (set, get) => ({
  typedBuffer: "",
  greekPendingAccent: null,
  stickyModifiers: [],
  physicalKeyState: DEFAULT_PHYSICAL_KEY_STATE,
  keyboardLayout: "QWERTY",
  inputMethods: [],
  layoutKeyLabels: [],
  languagePickerOpen: false,
  setTypedBuffer: (text) => {
    const clear = shouldClearSuggestions(text);
    if (clear) {
      storeFlags.suggestionsRequestId += 1;
    }
    set({
      typedBuffer: text,
      ...clearGreekPendingAccent(),
    });
    if (clear) {
      commitSuggestionList(set, []);
    }
  },
  appendTyped: (ch) => {
    const typedBuffer = get().typedBuffer + ch;
    const clear = shouldClearSuggestions(typedBuffer);
    if (clear) {
      storeFlags.suggestionsRequestId += 1;
    }
    set({ typedBuffer });
    if (clear) {
      commitSuggestionList(set, []);
    }
  },
  typeCharacter: (output, options) => {
    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = processCharacterInput(
      state.typedBuffer,
      state.greekPendingAccent,
      output,
      { physicalKey: options?.physicalKey, greekCompose: greek },
    );
    const clear = shouldClearSuggestions(result.buffer);
    if (clear) {
      storeFlags.suggestionsRequestId += 1;
    }
    set({
      typedBuffer: result.buffer,
      greekPendingAccent: result.pendingAccent,
    });
    if (clear) {
      commitSuggestionList(set, []);
    }
    return result.inject || null;
  },
  applyTypedLayoutTranslation: (translation, options) => {
    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = applyGreekLayoutTranslation(
      state.typedBuffer,
      state.greekPendingAccent,
      translation,
      {
        physicalKey: options?.physicalKey,
        shift: options?.shift,
        fallbackOutput: options?.fallbackOutput,
        greekCompose: greek,
      },
    );
    set({
      typedBuffer: result.buffer,
      greekPendingAccent: result.pending,
    });
    return result.inject || null;
  },
  applyLanguageLayoutTranslation: (translation, options) => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get())))
      return;
    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = applyGreekLayoutTranslation(
      state.languageInputBuffer,
      state.greekPendingAccent,
      translation,
      {
        physicalKey: options?.physicalKey,
        shift: options?.shift,
        fallbackOutput: options?.fallbackOutput,
        greekCompose: greek,
      },
    );
    set({
      languageInputBuffer: result.buffer,
      greekPendingAccent: result.pending,
      languageAnswerIncorrect: false,
    });
  },
  backspaceTyped: () => {
    const state = get();
    if (state.greekPendingAccent) {
      set(clearGreekPendingAccent());
      return;
    }
    const typedBuffer = state.typedBuffer.slice(0, -1);
    const clear = shouldClearSuggestions(typedBuffer);
    if (clear) {
      storeFlags.suggestionsRequestId += 1;
    }
    set({ typedBuffer });
    if (clear) {
      commitSuggestionList(set, []);
    }
  },
  toggleSticky: (modifier) =>
    set((s) => ({
      stickyModifiers: s.stickyModifiers.includes(modifier)
        ? s.stickyModifiers.filter((m) => m !== modifier)
        : [...s.stickyModifiers, modifier],
    })),
  pollKeyboardState: async () => {
    const epoch = get().settingsEpoch;
    const next = await invoke<PhysicalKeyState>("cmd_get_keyboard_state");
    const { physicalKeyState: prev, settings, keyboardLayout } = get();

    // Sync from the focused/target app so Win+Space / Alt+Shift updates our layout.
    // Skip while a language-button switch is in flight.
    const typingLanguageUnchanged =
      storeFlags.typingLanguageSwitchInFlight ||
      settings.typingLanguage === next.systemLanguage;
    const layoutUnchanged =
      keyboardLayout === next.keyboardLayout &&
      prev.systemHkl === next.systemHkl &&
      prev.systemKlid === next.systemKlid;

    if (
      physicalKeyStateEqual(prev, next) &&
      typingLanguageUnchanged &&
      layoutUnchanged
    ) {
      return;
    }

    if (get().settingsEpoch !== epoch) {
      return;
    }

    set({
      physicalKeyState: next,
      keyboardLayout: next.keyboardLayout,
      ...(typingLanguageUnchanged
        ? {}
        : { settings: { ...settings, typingLanguage: next.systemLanguage } }),
    });

    if (!layoutUnchanged) {
      await get().refreshLayoutKeyLabels(next.systemHkl);
    }

    if (!typingLanguageUnchanged) {
      const persisted = await persistSettingsIfCurrent(
        get,
        epoch,
        get().settings,
      );
      if (!persisted) {
        return;
      }
      set({ typedBuffer: "", ...clearGreekPendingAccent() });
      commitSuggestionList(set, []);
    }
  },
  loadInputMethods: async () => {
    const inputMethods = await invoke<InputMethod[]>("cmd_get_input_methods");
    set({ inputMethods });
  },
  setLanguagePickerOpen: (open) => set({ languagePickerOpen: open }),
  selectTypingInputMethod: async (method) => {
    const epoch = get().settingsEpoch;
    const previousTypingLanguage = get().settings.typingLanguage;
    storeFlags.typingLanguageSwitchInFlight = true;
    set({ languagePickerOpen: false });
    try {
      const result = await invoke<CommandResult>("cmd_set_input_method", {
        hkl: method.hkl,
      });
      if (!result.success) {
        const message = result.error?.trim() || LANGUAGE_CHANGE_FALLBACK;
        storeFlags.lastAnnouncedError = message;
        notify.error(message, { id: "typing-language-switch" });
        return;
      }
      if (get().settingsEpoch !== epoch) {
        return;
      }
      set({
        settings: {
          ...get().settings,
          typingLanguage: method.langTag,
        },
        keyboardLayout: method.layoutName,
      });
      const persisted = await persistSettingsIfCurrent(
        get,
        epoch,
        get().settings,
      );
      if (!persisted) {
        return;
      }
      await emit(PROFILE_UPDATED_EVENT, {
        source: WebviewWindow.getCurrent().label,
      });
      if (previousTypingLanguage !== method.langTag) {
        await get().stopDictation();
        set({ typedBuffer: "", ...clearGreekPendingAccent() });
        commitSuggestionList(set, []);
        await get().refreshSttCapability();
      }
      await get().refreshLayoutKeyLabels(method.hkl);
      await get().pollKeyboardState();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error || LANGUAGE_CHANGE_FALLBACK);
      storeFlags.lastAnnouncedError = message;
      notify.error(message, { id: "typing-language-switch" });
    } finally {
      storeFlags.typingLanguageSwitchInFlight = false;
    }
  },
  refreshLayoutKeyLabels: async (hkl?: number) => {
    const targetHkl = hkl ?? get().physicalKeyState.systemHkl;
    const layoutKeyLabels = await invoke<LayoutKeyLabel[]>(
      "cmd_get_layout_key_labels",
      { hkl: targetHkl || null },
    );
    set({ layoutKeyLabels });
  },
  clearSticky: () => set({ stickyModifiers: [] }),
  clearStickyExceptFn: () =>
    set((s) => ({
      stickyModifiers: s.stickyModifiers.filter((m) => m === "fn"),
    })),
  loadKeyboardLayout: async () => {
    const keyboardLayout = await invoke<string>("cmd_get_keyboard_layout");
    set({ keyboardLayout });
  },
});
