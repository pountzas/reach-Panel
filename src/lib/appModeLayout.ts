import type { KeyboardSectionMode } from "./types";

/** Captured before Teaching; `"unset"` means the ratio was previously undefined. */
export type WindowHeightRatioBeforeTeaching = number | null | "unset";

export function captureWindowHeightRatioBeforeTeaching(
  ratio: number | undefined | null,
): WindowHeightRatioBeforeTeaching {
  if (ratio == null) return "unset";
  return ratio;
}

/** Restore a captured ratio; `"unset"` / null → undefined so Teaching's 1.0 is cleared. */
export function restoreWindowHeightRatio(
  saved: WindowHeightRatioBeforeTeaching,
): number | undefined {
  if (saved === null || saved === "unset") return undefined;
  return saved;
}

/**
 * Teaching's synthesizer mode is session-only. Persisted profiles must not keep
 * `keyboardSectionMode: "synthesizer"` under Normal/Mini tablets.
 */
export function coercePersistedKeyboardSectionMode(
  mode: unknown,
  musicTeachingEnabled: boolean,
): KeyboardSectionMode {
  if (musicTeachingEnabled && mode === "synthesizer") {
    return "synthesizer";
  }
  return "keyboard";
}

/** True when a loaded profile still has synthesizer while Teaching is not active. */
export function needsKeyboardSectionModeMigration(
  rawMode: unknown,
  musicTeachingEnabled: boolean,
): boolean {
  return !musicTeachingEnabled && rawMode === "synthesizer";
}

/**
 * Piano / synthesizer chrome is a Teaching product surface — never show it
 * from `keyboardSectionMode === "synthesizer"` alone.
 */
export function isSynthesizerUiActive(
  musicTeachingEnabled: boolean,
  keyboardSectionMode: string,
): boolean {
  return musicTeachingEnabled && keyboardSectionMode === "synthesizer";
}

/** Lesson-slot Close restores the tablet captured before Teaching. */
export function lessonCloseAppMode(
  modeBeforeTeaching: "normal" | "mini" | null | undefined,
): "normal" | "mini" {
  return modeBeforeTeaching ?? "normal";
}

/**
 * After `updateSettings`, whether non-mini Normal/Teaching must re-apply
 * window layout (monitor move, height, or section change).
 */
export function shouldSyncNonMiniWindowLayout(input: {
  miniModeActive: boolean;
  accessibilityMonitorIdInPatch: boolean;
  windowHeightRatioInPatch: boolean;
  keyboardSectionModeInPatch: boolean;
}): boolean {
  if (input.miniModeActive) return false;
  return (
    input.accessibilityMonitorIdInPatch ||
    input.windowHeightRatioInPatch ||
    input.keyboardSectionModeInPatch
  );
}
