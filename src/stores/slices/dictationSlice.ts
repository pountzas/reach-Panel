import type { StateCreator } from "zustand";
import type { AppStore, DictationSlice } from "../types";
import { invoke } from "@tauri-apps/api/core";
import type { CommandResult } from "../../lib/types";
import { DICTATION_SELECT_INPUT_ERROR } from "../../lib/dictationErrors";
import { pcMicHoldEnabled } from "../../lib/pcMicSend";

let pcMicHoldDownInFlight = false;
let pcMicStopWhileHoldDownPending = false;

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
> = (set, get) => ({
  pcMicHolding: false,

  toggleDictation: async () => {
    if (!get().externalInputFocused) {
      get().setLastError(DICTATION_SELECT_INPUT_ERROR);
      return;
    }
    if (pcMicHoldEnabled(get().settings)) {
      return;
    }
    await invokeCommand(
      "cmd_launch_windows_voice_typing",
      get,
      "Could not start Windows Voice typing",
    );
  },

  startPcMicHold: async () => {
    if (!get().externalInputFocused) {
      get().setLastError(DICTATION_SELECT_INPUT_ERROR);
      return;
    }
    if (get().pcMicHolding || pcMicHoldDownInFlight) return;
    pcMicHoldDownInFlight = true;
    pcMicStopWhileHoldDownPending = false;
    const ok = await invokeCommand(
      "cmd_pc_mic_hold_down",
      get,
      "Could not start hold-to-talk",
    );
    pcMicHoldDownInFlight = false;
    if (pcMicStopWhileHoldDownPending) {
      pcMicStopWhileHoldDownPending = false;
      if (ok) {
        await invokeCommand(
          "cmd_pc_mic_hold_up",
          get,
          "Could not release hold-to-talk key",
        );
      } else {
        await invokeCommand(
          "cmd_pc_mic_release_stuck_keys",
          get,
          "Could not release stuck keys",
        );
      }
      set({ pcMicHolding: false });
      return;
    }
    if (ok) {
      set({ pcMicHolding: true });
    }
  },

  stopPcMicHold: async () => {
    if (pcMicHoldDownInFlight) {
      pcMicStopWhileHoldDownPending = true;
      set({ pcMicHolding: false });
      return;
    }
    if (!get().pcMicHolding) {
      await invokeCommand(
        "cmd_pc_mic_release_stuck_keys",
        get,
        "Could not release stuck keys",
      );
      return;
    }
    set({ pcMicHolding: false });
    await invokeCommand(
      "cmd_pc_mic_hold_up",
      get,
      "Could not release hold-to-talk key",
    );
  },
});
