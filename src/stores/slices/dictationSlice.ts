import type { StateCreator } from "zustand";
import type { AppStore, DictationSlice } from "../types";
import { invoke } from "@tauri-apps/api/core";
import type { CommandResult } from "../../lib/types";
import { DICTATION_SELECT_INPUT_ERROR } from "../../lib/dictationErrors";

export const createDictationSlice: StateCreator<
  AppStore,
  [],
  [],
  DictationSlice
> = (set, get) => ({
  toggleDictation: async () => {
    if (!get().externalInputFocused) {
      get().setLastError(DICTATION_SELECT_INPUT_ERROR);
      return;
    }
    try {
      const result = await invoke<CommandResult>(
        "cmd_launch_windows_voice_typing",
      );
      if (!result.success) {
        get().setLastError(
          result.error ?? "Could not start Windows Voice typing",
        );
      }
    } catch (error) {
      get().setLastError(
        error instanceof Error ? error.message : String(error),
      );
    }
  },
});
