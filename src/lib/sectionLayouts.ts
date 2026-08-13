import { resolveDockedSectionVisibility } from "./sectionRegistry";

export const SECTION_HEADER_HEIGHT_PX = 28;
export const SECTION_HEADER_HEIGHT_LARGE_PX = 56;
export const APP_HEADER_HEIGHT_PX = 48;
export const APP_HEADER_HEIGHT_LARGE_PX = 96;
/** Clamp for optional user-dragged OS window height ratio. */
export const WINDOW_HEIGHT_RATIO_MIN = 0.5;
export const WINDOW_HEIGHT_RATIO_MAX = 1;

const GAP_PCT = 1;
const QUICK_ACTIONS_HEIGHT_RATIO = 0.1;
const PHRASES_HEIGHT_RATIO = 0.38;
const GAP_HEIGHT_RATIO = GAP_PCT / 100;
const MIN_CONTENT_HEIGHT_RATIO = WINDOW_HEIGHT_RATIO_MIN;

export function sectionHeaderHeightPx(largeHeaders: boolean): number {
  return largeHeaders ? SECTION_HEADER_HEIGHT_LARGE_PX : SECTION_HEADER_HEIGHT_PX;
}

export function appHeaderHeightPx(largeHeaders: boolean): number {
  return largeHeaders ? APP_HEADER_HEIGHT_LARGE_PX : APP_HEADER_HEIGHT_PX;
}

export function clampWindowHeightRatio(ratio: number): number {
  return Math.max(WINDOW_HEIGHT_RATIO_MIN, Math.min(WINDOW_HEIGHT_RATIO_MAX, ratio));
}

/**
 * Fraction of the full keyboard region height needed for the currently
 * visible sections. All visible → 1.0; hiding phrases/QA shrinks the window.
 */
export function computeContentHeightRatio(visible: {
  quickActions: boolean;
  phrases: boolean;
}): number {
  if (visible.quickActions && visible.phrases) {
    return 1;
  }

  let ratio = 1;
  if (!visible.phrases) {
    ratio -= PHRASES_HEIGHT_RATIO + GAP_HEIGHT_RATIO;
  }
  if (!visible.quickActions) {
    ratio -= QUICK_ACTIONS_HEIGHT_RATIO + GAP_HEIGHT_RATIO;
  }

  return Math.max(MIN_CONTENT_HEIGHT_RATIO, Math.min(1, ratio));
}

/**
 * Content height after v1 chrome gates.
 * QA off and phrases on only when the music lesson slot is visible.
 */
export function computeContentHeightRatioFromSettings(
  settings: {
    quickActionsVisible: boolean;
    phrasesVisible: boolean;
  },
  lessonSlotVisible = false,
): number {
  return computeContentHeightRatio(
    resolveDockedSectionVisibility({
      quickActionsVisible: settings.quickActionsVisible,
      phrasesVisible: settings.phrasesVisible,
      lessonSlotVisible,
    }),
  );
}
