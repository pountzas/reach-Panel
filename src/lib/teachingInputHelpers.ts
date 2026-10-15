import { isInputPreviewActiveForMode } from "./focusMode";
import type { AppSettings } from "./types";

export type TeachingChromeVisibilityInput = {
  teachingSessionActive: boolean;
  settings: AppSettings;
  showSynth: boolean;
  compact: boolean;
  companionSessionLive: boolean;
  languageLessonActive: boolean;
  focusModeActive: boolean;
};

export type TeachingChromeVisibility = {
  showInputPreview: boolean;
  showSuggestions: boolean;
  dictationKeyVisible: boolean;
};

export function teachingInputHelpersEnabled(settings: AppSettings): boolean {
  return settings.showTeachingInputHelpers !== false;
}

export function teachingHidesInputHelpers(
  teachingSessionActive: boolean,
  settings: AppSettings,
): boolean {
  return teachingSessionActive && !teachingInputHelpersEnabled(settings);
}

export function shouldSuppressLanguageSuggestions(
  languageLessonActive: boolean,
  settings: AppSettings,
): boolean {
  return languageLessonActive && !teachingInputHelpersEnabled(settings);
}

export function isDictationKeyVisible(
  settings: AppSettings,
  teachingSessionActive: boolean,
): boolean {
  if (!settings.dictationVisible) return false;
  if (teachingHidesInputHelpers(teachingSessionActive, settings)) return false;
  return true;
}

export function computeTeachingChromeVisibility(
  input: TeachingChromeVisibilityInput,
): TeachingChromeVisibility {
  const helpersHidden = teachingHidesInputHelpers(
    input.teachingSessionActive,
    input.settings,
  );
  return {
    showInputPreview:
      !input.showSynth &&
      !input.compact &&
      !helpersHidden &&
      !input.companionSessionLive &&
      isInputPreviewActiveForMode(input.settings, input.focusModeActive),
    showSuggestions:
      !input.showSynth &&
      input.settings.suggestionsVisible &&
      !input.compact &&
      !helpersHidden &&
      !shouldSuppressLanguageSuggestions(
        input.languageLessonActive,
        input.settings,
      ),
    dictationKeyVisible: isDictationKeyVisible(
      input.settings,
      input.teachingSessionActive,
    ),
  };
}

export function shouldStopDictationForVisibility(
  dictationKeyVisible: boolean,
  dictationState: "idle" | "listening" | "processing",
): boolean {
  return !dictationKeyVisible && dictationState !== "idle";
}
