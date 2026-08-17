import type { AppSettings, KeyboardSectionMode } from "./types";

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
 * Leaving Teaching must not keep a persisted 1.0 ratio (fullscreen is fullWorkArea only).
 * Unset/null/near-1.0 → undefined so callers can delete the setting key.
 */
export function heightRatioAfterLeavingTeaching(
  saved: WindowHeightRatioBeforeTeaching,
): number | undefined {
  const restored = restoreWindowHeightRatio(saved);
  if (restored == null || restored >= 0.999) return undefined;
  return restored;
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

/**
 * Disk never stores Teaching chrome. A live session still hydrates synthesizer
 * so the lesson slot can show after Settings reloads the profile.
 */
export function hydrateKeyboardSectionMode(
  persistedMode: unknown,
  musicTeachingEnabled: boolean,
): KeyboardSectionMode {
  if (musicTeachingEnabled) {
    return "synthesizer";
  }
  return coercePersistedKeyboardSectionMode(persistedMode, false);
}

/** Strip session Teaching chrome before writing settings JSON. */
export function settingsForPersist(settings: AppSettings): AppSettings {
  if (settings.keyboardSectionMode !== "synthesizer") {
    return settings;
  }
  return { ...settings, keyboardSectionMode: "keyboard" };
}

/** Settings/tool windows must not own Teaching; the main webview hosts the lesson slot. */
export function shouldDelegateAppModeToMain(windowLabel: string): boolean {
  return windowLabel !== "main";
}

export function teachingSessionKeyboardMode(
  musicTeachingEnabled: boolean,
): KeyboardSectionMode {
  return musicTeachingEnabled ? "synthesizer" : "keyboard";
}

export const APP_MODE_REQUEST_EVENT = "app-mode-request";
export const TEACHING_LESSON_REQUEST_EVENT = "teaching-lesson-request";
export const TEACHING_SESSION_EVENT = "teaching-session";
export const TEACHING_SESSION_REQUEST_EVENT = "teaching-session-request";

export type AppModeRequest = {
  mode: "normal" | "mini" | "teaching" | "companion";
};
export type AppModeTablet = "normal" | "mini" | "teaching" | "companion";
export type HostAppMode = "normal" | "mini" | "teaching";
export type CompanionSessionPhase = "idle" | "active" | "reconnecting";
export type TeachingLessonRequest = { lesson: "music" | "math" | "language" };
export type TeachingSessionPayload = {
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
  keyboardSectionMode: KeyboardSectionMode;
};

/** True when a loaded profile still has synthesizer while Teaching is not active. */
export function needsKeyboardSectionModeMigration(
  rawMode: unknown,
  musicTeachingEnabled: boolean,
): boolean {
  return !musicTeachingEnabled && rawMode === "synthesizer";
}

export type TeachingLessonId = "music" | "math" | "language";

/**
 * Piano / synthesizer chrome is a Teaching product surface — never show it
 * from `keyboardSectionMode === "synthesizer"` alone, and only on Music.
 */
export function isTeachingSessionActive(
  musicTeachingEnabled: boolean,
  keyboardSectionMode: string,
): boolean {
  return musicTeachingEnabled && keyboardSectionMode === "synthesizer";
}

export function isSynthesizerUiActive(
  musicTeachingEnabled: boolean,
  keyboardSectionMode: string,
  teachingLesson: TeachingLessonId,
): boolean {
  return (
    isTeachingSessionActive(musicTeachingEnabled, keyboardSectionMode) &&
    teachingLesson === "music"
  );
}

export function teachingLessonTitleKey(
  lesson: TeachingLessonId,
): "languageLessonTitle" | "musicLesson" | "mathLessonTitle" {
  switch (lesson) {
    case "language":
      return "languageLessonTitle";
    case "music":
      return "musicLesson";
    case "math":
      return "mathLessonTitle";
    default: {
      const _exhaustive: never = lesson;
      return _exhaustive;
    }
  }
}

export function lessonCloseAppMode(
  modeBeforeTeaching: "normal" | "mini" | null | undefined,
): "normal" | "mini" {
  return modeBeforeTeaching ?? "normal";
}

export function isCompanionTabletEnabled(
  session: CompanionSessionPhase,
): boolean {
  switch (session) {
    case "active":
    case "reconnecting":
      return true;
    case "idle":
      return false;
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

export function isCompanionModeActive(
  companionModeActive: boolean,
): boolean {
  return companionModeActive;
}

export function resolveSelectedAppMode(input: {
  companionModeActive: boolean;
  teachingActive: boolean;
  miniModeOverride: boolean | undefined;
}): AppModeTablet {
  if (input.companionModeActive) return "companion";
  if (input.teachingActive) return "teaching";
  if (input.miniModeOverride === true) return "mini";
  return "normal";
}

export function captureModeBeforeCompanion(
  selected: AppModeTablet,
): HostAppMode | null {
  switch (selected) {
    case "companion":
      return null;
    case "normal":
    case "mini":
    case "teaching":
      return selected;
    default: {
      const _exhaustive: never = selected;
      return _exhaustive;
    }
  }
}

export function restoreModeAfterCompanion(
  modeBeforeCompanion: HostAppMode | null | undefined,
): HostAppMode {
  return modeBeforeCompanion ?? "normal";
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
