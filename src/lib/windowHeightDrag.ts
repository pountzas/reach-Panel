import { clampWindowHeightRatio } from "./sectionLayouts";

/**
 * Gate for applyWindowHeightRatioLive.
 * Collapsed FAB is the only skip; mini mode grips must still preview height.
 */
export function shouldApplyLiveWindowHeightRatio(input: {
  collapsed: boolean;
  miniModeActive: boolean;
}): boolean {
  void input.miniModeActive;
  return !input.collapsed;
}

/** Drag up (negative deltaY) → taller window; bottom edge stays fixed. */
export function nextWindowHeightRatioFromPointerDelta(
  startRatio: number,
  clientY: number,
  startY: number,
  regionHeight: number,
): number {
  const delta = clientY - startY;
  return clampWindowHeightRatio(startRatio - delta / regionHeight);
}
