import { resolveDockedSectionVisibility } from "./sectionRegistry";

export const SECTION_HEADER_HEIGHT_PX = 28;
export const SECTION_HEADER_HEIGHT_LARGE_PX = 56;
export const APP_HEADER_HEIGHT_PX = 48;
export const APP_HEADER_HEIGHT_LARGE_PX = 96;
/** Clamp for optional user-dragged OS window height ratio (min = 35% of region). */
export const WINDOW_HEIGHT_RATIO_MIN = 0.35;
export const WINDOW_HEIGHT_RATIO_MAX = 1;

const GAP_PCT = 1;
/** Former phrases weight — teaching occupies that stack slot. */
const TEACHING_HEIGHT_RATIO = 0.38;
/** Former quick-actions weight — permanently removed from the stack. */
const REMOVED_QUICK_ACTIONS_HEIGHT_RATIO = 0.1;
const GAP_HEIGHT_RATIO = GAP_PCT / 100;
const MIN_CONTENT_HEIGHT_RATIO = WINDOW_HEIGHT_RATIO_MIN;

export function sectionHeaderHeightPx(largeHeaders = false): number {
  return largeHeaders ? SECTION_HEADER_HEIGHT_LARGE_PX : SECTION_HEADER_HEIGHT_PX;
}

export function appHeaderHeightPx(largeHeaders = false): number {
  return largeHeaders ? APP_HEADER_HEIGHT_LARGE_PX : APP_HEADER_HEIGHT_PX;
}

export function clampWindowHeightRatio(ratio: number): number {
  return Math.max(WINDOW_HEIGHT_RATIO_MIN, Math.min(WINDOW_HEIGHT_RATIO_MAX, ratio));
}

/**
 * Fraction of the full keyboard region height needed for the currently
 * visible sections. Teaching + keyboard preserves the pre-removal
 * "phrases only" ratio; keyboard alone shrinks further.
 */
export function computeContentHeightRatio(visible: {
  teaching: boolean;
}): number {
  // Always subtract removed quick-actions height for numerical continuity.
  let ratio = 1 - REMOVED_QUICK_ACTIONS_HEIGHT_RATIO - GAP_HEIGHT_RATIO;
  if (!visible.teaching) {
    ratio -= TEACHING_HEIGHT_RATIO + GAP_HEIGHT_RATIO;
  }
  return Math.max(MIN_CONTENT_HEIGHT_RATIO, Math.min(1, ratio));
}

/**
 * Content height from teaching lesson-slot visibility.
 */
export function computeContentHeightRatioFromSettings(
  lessonSlotVisible = false,
): number {
  return computeContentHeightRatio(
    resolveDockedSectionVisibility({ lessonSlotVisible }),
  );
}
