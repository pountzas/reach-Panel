import type { StateCreator } from "zustand";
import type { AppStore, CompanionSlice } from "../types";
import { mapCompanionSessionPhase, shouldIgnoreCompanionIdle } from "../../lib/companionSession";
import { captureModeBeforeCompanion, resolveSelectedAppMode, restoreModeAfterCompanion } from "../../lib/appModeLayout";
import type { HostAppMode } from "../../lib/appModeLayout";
import { peekRestore } from "../lib/restoreStack";

export const createCompanionSlice: StateCreator<
  AppStore,
  [],
  [],
  CompanionSlice
> = (set, get) => ({
  companionModeActive: false,
  companionSessionLive: false,
  inputPreviewFrame: null,
  externalInputFocused: false,
  companionBridgeArmed: false,
  applyCompanionSessionPhase: async (phase) => {
    const companionMode =
      peekRestore(get().restoreStack, "companion")?.mode ?? null;
    const mapped = mapCompanionSessionPhase(phase, companionMode);
    if (mapped.live) {
      if (get().companionSessionLive) {
        return;
      }
      const current = get();
      const teachingActive =
        current.musicTeachingEnabled &&
        current.settings.keyboardSectionMode === "synthesizer";
      const captured = captureModeBeforeCompanion(
        resolveSelectedAppMode({
          companionModeActive: current.companionModeActive,
          teachingActive,
          focusModeOverride: current.settings.focusModeOverride ?? undefined,
          micMode: current.settings.micMode === true,
        }),
      );
      if (captured != null) {
        get().pushRestore("companion", { mode: captured }, { replace: true });
      }
      set({
        companionSessionLive: true,
        companionModeActive: true,
        companionBridgeArmed: true,
      });
      return;
    }
    if (shouldIgnoreCompanionIdle(get().companionModeActive)) {
      return;
    }
    get().popRestore("companion");
    set({
      companionSessionLive: false,
      companionModeActive: false,
      companionBridgeArmed: true,
    });
    await get().setAppMode(mapped.restore, { skipCompanionBridgeStop: true });
  },
  stopCompanionByCaregiver: async () => {
    const current = get();
    const teachingActive =
      current.musicTeachingEnabled &&
      current.settings.keyboardSectionMode === "synthesizer";
    const selected = resolveSelectedAppMode({
      companionModeActive: current.companionModeActive,
      teachingActive,
      focusModeOverride: current.settings.focusModeOverride ?? undefined,
      micMode: current.settings.micMode === true,
    });
    const companionMode =
      peekRestore(current.restoreStack, "companion")?.mode ?? null;
    const host: HostAppMode =
      selected === "companion"
        ? restoreModeAfterCompanion(companionMode)
        : selected;
    await get().setAppMode(host);
  },
});
