import {
  restoreModeAfterCompanion,
  type CompanionSessionPhase,
  type HostAppMode,
} from "./appModeLayout";

/** Pure mapping from tablet session phase → host live flag / restore mode. */
export type CompanionSessionPhaseMapping =
  | { live: true }
  | { live: false; restore: HostAppMode };

export function mapCompanionSessionPhase(
  phase: CompanionSessionPhase,
  modeBeforeCompanion: HostAppMode | null | undefined = null,
): CompanionSessionPhaseMapping {
  switch (phase) {
    case "active":
    case "reconnecting":
      return { live: true };
    case "idle":
      return {
        live: false,
        restore: restoreModeAfterCompanion(modeBeforeCompanion),
      };
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
