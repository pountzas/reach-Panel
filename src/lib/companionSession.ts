import {
  restoreModeAfterCompanion,
  type CompanionSessionPhase,
  type HostAppMode,
} from "./appModeLayout";

export type CompanionLeaveReason = "sessionIdle" | "caregiverLeft";

export type CompanionLeavePlan = {
  stopBridge: boolean;
  keepArmed: boolean;
  restoreHostMode: boolean;
};

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

/** sessionIdle keeps the listener; caregiverLeft is the only way to stop it. */
export function planCompanionLeave(
  reason: CompanionLeaveReason,
  companionModeActive: boolean,
): CompanionLeavePlan {
  switch (reason) {
    case "sessionIdle":
      return {
        stopBridge: false,
        keepArmed: true,
        restoreHostMode: companionModeActive,
      };
    case "caregiverLeft":
      return {
        stopBridge: true,
        keepArmed: false,
        restoreHostMode: false,
      };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Idle after a caregiver already switched modes must not clobber that mode. */
export function shouldIgnoreCompanionIdle(companionModeActive: boolean): boolean {
  return !companionModeActive;
}

export function shouldStopCompanionBridgeOnHostMode(
  companionBridgeArmed: boolean,
  companionModeActive: boolean,
): boolean {
  return companionBridgeArmed || companionModeActive;
}
