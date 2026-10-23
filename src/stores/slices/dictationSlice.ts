import type { StateCreator } from "zustand";
import type { AppStore, DictationSlice } from "../types";
import { invoke } from "@tauri-apps/api/core";
import type { DictationState } from "../types";

export const createDictationSlice: StateCreator<
  AppStore,
  [],
  [],
  DictationSlice
> = (set, get) => ({
  dictationState: "idle",
  sttCapability: null,
  setDictationState: (state) => {
    set({ dictationState: state });
  },
  setSttCapability: (capability) => {
    set({ sttCapability: capability });
  },
  refreshSttCapability: async () => {
    try {
      const trimmedKey = get().settings.groqApiKey?.trim();
      const settingsKey =
        trimmedKey !== undefined && trimmedKey.length > 0 ? trimmedKey : null;
      const status = await invoke<{
        state: DictationState;
        engine: "winrt" | "groq" | null;
        groqConfigured: boolean;
        winrtSupported: boolean;
        online: boolean;
        canDictate: boolean;
      }>("cmd_get_stt_status", {
        language: get().settings.typingLanguage,
        groqApiKey: settingsKey,
      });
      set({
        dictationState: status.state,
        sttCapability: {
          engine: status.engine,
          groqConfigured: status.groqConfigured,
          winrtSupported: status.winrtSupported,
          online: status.online,
          canDictate: status.canDictate,
        },
      });
    } catch {
      set({
        sttCapability: {
          engine: null,
          groqConfigured: false,
          winrtSupported: false,
          online: false,
          canDictate: false,
        },
      });
    }
  },
  toggleDictation: async () => {
    const { dictationState, settings, sttCapability } = get();
    if (dictationState === "listening" || dictationState === "processing") {
      await get().stopDictation();
      return;
    }
    if (sttCapability && !sttCapability.canDictate) {
      set({
        lastError: !sttCapability.online
          ? "GROQ_API: Dictation requires an internet connection."
          : sttCapability.winrtSupported
            ? "GROQ_API: Dictation is unavailable right now."
            : "GROQ_KEY: Windows speech recognition does not support this language. Add a free Groq API key in Settings to dictate.",
      });
      return;
    }
    try {
      const trimmedGroqKey = settings.groqApiKey?.trim();
      const groqApiKey =
        trimmedGroqKey !== undefined && trimmedGroqKey.length > 0
          ? trimmedGroqKey
          : null;
      await invoke("cmd_start_dictation", {
        language: settings.typingLanguage,
        groqApiKey,
      });
      set({ dictationState: "listening" });
      await get().refreshSttCapability();
    } catch (error) {
      set({ dictationState: "idle" });
      set({
        lastError: error instanceof Error ? error.message : String(error),
      });
      await get().refreshSttCapability();
    }
  },
  stopDictation: async () => {
    if (get().dictationState === "idle") return;
    // Optimistic: clear listening UI immediately so the mic toggle feels responsive
    // even when Groq was mid-transcription (common on Greek path).
    set({ dictationState: "idle" });
    try {
      await invoke("cmd_stop_dictation");
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
