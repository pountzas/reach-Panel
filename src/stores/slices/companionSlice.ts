import type { StateCreator } from "zustand";
import type { AppStore, CompanionSlice } from "../types";
import { mapCompanionSessionPhase, shouldIgnoreCompanionIdle } from "../../lib/companionSession";
import { captureModeBeforeCompanion, resolveSelectedAppMode, restoreModeAfterCompanion } from "../../lib/appModeLayout";
import type { HostAppMode } from "../../lib/appModeLayout";

export const createCompanionSlice: StateCreator<
  AppStore,
  [],
  [],
  CompanionSlice
> = (set, get) => ({
  companionModeActive: false,
  modeBeforeCompanion: null,
  companionSessionLive: false,
  inputPreviewFrame: null,
  externalInputFocused: false,
  companionBridgeArmed: false,
  applyCompanionSessionPhase: async (phase) => {
    const mapped = mapCompanionSessionPhase(phase, get().modeBeforeCompanion);
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
      set({
        companionSessionLive: true,
        companionModeActive: true,
        companionBridgeArmed: true,
        ...(captured != null ? { modeBeforeCompanion: captured } : {}),
      });
      return;
    }
    if (shouldIgnoreCompanionIdle(get().companionModeActive)) {
      return;
    }
    set({
      companionSessionLive: false,
      companionModeActive: false,
      modeBeforeCompanion: null,
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
    const host: HostAppMode =
      selected === "companion"
        ? restoreModeAfterCompanion(current.modeBeforeCompanion)
        : selected;
    await get().setAppMode(host);
  },
});
