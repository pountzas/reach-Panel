/**
 * v1 product chrome gates. Modules/commands stay; Windows UI hides these surfaces.
 * Flip a flag to false (or remove the gate) to restore a surface for v2.
 */
export const V1_HIDDEN_FEATURES = {
  largeHeaders: true,
  mouse: true,
  quickActions: true,
  phrases: true,
  macroBuilder: true,
  headTracking: true,
} as const;

export type V1HiddenFeature = keyof typeof V1_HIDDEN_FEATURES;

export function isV1FeatureHidden(feature: V1HiddenFeature): boolean {
  return V1_HIDDEN_FEATURES[feature];
}

/** Stored largeHeaders ignored while the flag is on. */
export function effectiveLargeHeaders(stored: boolean): boolean {
  return isV1FeatureHidden("largeHeaders") ? false : stored;
}

/** Mouse column is never shown in Windows chrome while the flag is on. */
export function effectiveMouseVisible(stored: boolean): boolean {
  return isV1FeatureHidden("mouse") ? false : stored;
}

/** Quick Actions bar never shown while the flag is on. */
export function effectiveQuickActionsVisible(stored: boolean): boolean {
  return isV1FeatureHidden("quickActions") ? false : stored;
}

/**
 * Phrases panel visibility for Windows chrome.
 * While the phrases flag is on, user phrases stay off; the music lesson slot
 * may still occupy the phrases stack position without treating phrases as on.
 */
export function effectivePhrasesVisible(
  stored: boolean,
  lessonSlotVisible = false,
): boolean {
  if (isV1FeatureHidden("phrases")) {
    return false;
  }
  return stored || lessonSlotVisible;
}

/**
 * Docked stack / content-height visibility after v1 gates.
 * Lesson slot can still reserve phrases height without enabling user phrases.
 */
export function resolveV1SectionVisibility(input: {
  quickActionsVisible: boolean;
  phrasesVisible: boolean;
  lessonSlotVisible?: boolean;
}): { quickActions: boolean; phrases: boolean } {
  const lessonSlotVisible = Boolean(input.lessonSlotVisible);
  return {
    quickActions: effectiveQuickActionsVisible(input.quickActionsVisible),
    phrases: isV1FeatureHidden("phrases")
      ? lessonSlotVisible
      : input.phrasesVisible || lessonSlotVisible,
  };
}

export function isV1ToolWindowHidden(
  label: "macro-builder" | "head-tracking" | "settings",
): boolean {
  switch (label) {
    case "macro-builder":
      return isV1FeatureHidden("macroBuilder");
    case "head-tracking":
      return isV1FeatureHidden("headTracking");
    case "settings":
      return false;
    default: {
      const _exhaustive: never = label;
      return _exhaustive;
    }
  }
}

/** Music lesson occupies the phrases slot without requiring phrasesVisible. */
export function isMusicLessonSlotVisible(input: {
  musicTeachingEnabled: boolean;
  keyboardSectionMode: string;
}): boolean {
  return (
    input.musicTeachingEnabled && input.keyboardSectionMode === "synthesizer"
  );
}
