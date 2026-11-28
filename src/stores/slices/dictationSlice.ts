import type { StateCreator } from "zustand";
import type { AppStore, DictationSlice } from "../types";
import { invoke } from "@tauri-apps/api/core";
import type { CommandResult } from "../../lib/types";
import { DICTATION_SELECT_INPUT_ERROR } from "../../lib/dictationErrors";

async function invokeCommand(
  cmd: string,
  get: () => AppStore,
  errorFallback: string,
): Promise<boolean> {
  try {
    const result = await invoke<CommandResult>(cmd);
    if (!result.success) {
      get().setLastError(result.error ?? errorFallback);
      return false;
    }
    return true;
  } catch (error) {
    get().setLastError(error instanceof Error ? error.message : String(error));
    return false;
  }
}

export const createDictationSlice: StateCreator<
  AppStore,
  [],
  [],
  DictationSlice
> = (_set, get) => ({
  toggleDictation: async () => {
    if (!get().externalInputFocused) {
      get().setLastError(DICTATION_SELECT_INPUT_ERROR);
      return;
    }
    await invokeCommand(
      "cmd_launch_windows_voice_typing",
      get,
      "Could not start Windows Voice typing",
    );
  },
});
