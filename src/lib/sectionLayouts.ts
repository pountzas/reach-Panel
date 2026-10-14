export const SECTION_HEADER_HEIGHT_PX = 28;
export const APP_HEADER_HEIGHT_PX = 48;
/**
 * Clamp for user-dragged OS window height ratio (25%–100% of region).
 * Keep in sync with Rust `WINDOW_HEIGHT_RATIO_MIN` / `WINDOW_HEIGHT_RATIO_MAX`.
 */
export const WINDOW_HEIGHT_RATIO_MIN = 0.25;
export const WINDOW_HEIGHT_RATIO_MAX = 1;
/** Focus-mode default (fraction of the full monitor) when no grip height is saved. */
export const DEFAULT_WINDOW_HEIGHT_RATIO = 0.42;
/** Normal-mode default when unset — matches pre-0.17 effective height (v1 sections removed). */
export const DEFAULT_NORMAL_WINDOW_HEIGHT_RATIO = 0.5;

export function sectionHeaderHeightPx(): number {
  return SECTION_HEADER_HEIGHT_PX;
}

export function appHeaderHeightPx(): number {
  return APP_HEADER_HEIGHT_PX;
}

export function clampWindowHeightRatio(ratio: number): number {
  return Math.max(WINDOW_HEIGHT_RATIO_MIN, Math.min(WINDOW_HEIGHT_RATIO_MAX, ratio));
}

/**
 * Normal/Focus OS window height as a fraction of the layout region.
 * User grip (`windowHeightRatio`) wins; otherwise mode-specific defaults.
 * The same saved ratio applies in Normal and Focus, but each mode measures
 * against a different layout region (half monitor vs full monitor).
 * Teaching full-work-area always returns 1.
 */
export function resolveWindowHeightRatio(
  windowHeightRatio: number | null | undefined,
  opts?: { teachingFullWorkArea?: boolean; focusMode?: boolean },
): number {
  if (opts?.teachingFullWorkArea) {
    return 1;
  }
  if (windowHeightRatio == null) {
    return opts?.focusMode
      ? DEFAULT_WINDOW_HEIGHT_RATIO
      : DEFAULT_NORMAL_WINDOW_HEIGHT_RATIO;
  }
  return clampWindowHeightRatio(windowHeightRatio);
}
