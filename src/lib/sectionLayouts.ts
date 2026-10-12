export const SECTION_HEADER_HEIGHT_PX = 28;
export const SECTION_HEADER_HEIGHT_LARGE_PX = 56;
export const APP_HEADER_HEIGHT_PX = 48;
export const APP_HEADER_HEIGHT_LARGE_PX = 96;
/** Clamp for user-dragged OS window height ratio (min = 25% of region). */
export const WINDOW_HEIGHT_RATIO_MIN = 0.25;
export const WINDOW_HEIGHT_RATIO_MAX = 1;
/** Shared Normal/Focus default when the user has not set a grip height yet. */
export const DEFAULT_WINDOW_HEIGHT_RATIO = 0.42;

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
 * Normal/Focus OS window height as a fraction of the layout region.
 * User grip (`windowHeightRatio`) wins; otherwise the shared default.
 * Teaching full-work-area always returns 1.
 */
export function resolveWindowHeightRatio(
  windowHeightRatio: number | null | undefined,
  opts?: { teachingFullWorkArea?: boolean },
): number {
  if (opts?.teachingFullWorkArea) {
    return 1;
  }
  if (windowHeightRatio == null) {
    return DEFAULT_WINDOW_HEIGHT_RATIO;
  }
  return clampWindowHeightRatio(windowHeightRatio);
}
