/**
 * v1 product chrome gates. Modules/commands stay; Windows UI hides these surfaces.
 * Flip a flag to false (or remove the gate) to restore a surface for v2.
 */
export const V1_HIDDEN_FEATURES = {
  mouse: true,
} as const;

export type V1HiddenFeature = keyof typeof V1_HIDDEN_FEATURES;

export function isV1FeatureHidden(feature: V1HiddenFeature): boolean {
  return V1_HIDDEN_FEATURES[feature];
}

/** Mouse column is never shown in Windows chrome while the flag is on. */
export function effectiveMouseVisible(stored: boolean): boolean {
  return isV1FeatureHidden("mouse") ? false : stored;
}

/** Teaching lesson occupies the teaching section when teaching + synth. */
export function isMusicLessonSlotVisible(input: {
  musicTeachingEnabled: boolean;
  keyboardSectionMode: string;
  /** Present for callers; any lesson still occupies the slot while teaching+synth. */
  teachingLesson?: "music" | "math" | "language";
}): boolean {
  return (
    input.musicTeachingEnabled && input.keyboardSectionMode === "synthesizer"
  );
}

/** True while Teaching layout should fill the entire monitor work area. */
export function isTeachingFullWorkArea(input: {
  musicTeachingEnabled: boolean;
  keyboardSectionMode: string;
}): boolean {
  return (
    input.musicTeachingEnabled && input.keyboardSectionMode === "synthesizer"
  );
}
