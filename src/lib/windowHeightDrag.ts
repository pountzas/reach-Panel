import { clampWindowHeightRatio } from "./sectionLayouts";
import { resolveMonitorScaleFactor } from "./toolWindows";
import type { MonitorInfo } from "./types";

/**
 * Gate for applyWindowHeightRatioLive.
 * Skip the true FAB (collapsed, or focus with keyboard hidden). Focus keeps
 * `settings.collapsed === true` while the keyboard is open — grips must still
 * preview height in that state.
 */
export function shouldApplyLiveWindowHeightRatio(input: {
  collapsed: boolean;
  focusModeActive: boolean;
  focusModeKeyboardVisible: boolean;
}): boolean {
  if (input.focusModeActive && input.focusModeKeyboardVisible) {
    return true;
  }
  return !input.collapsed;
}

/** Work-area region the OS window is bottom-anchored within (logical / CSS px). */
export type WindowHeightDragRegion = {
  /** Inclusive bottom edge Y in screen/CSS coordinates. */
  bottom: number;
  /** Region height in the same units as `bottom` and `screenY`. */
  height: number;
}

/**
 * Resolve the layout region in CSS/logical pixels so it matches `event.screenY`.
 * Win32 monitor rects are physical; Chromium screenY is logical.
 */
export function resolveWindowHeightDragRegion(
  monitor: MonitorInfo,
  opts: {
    fullWorkArea: boolean;
    multiMonitor: boolean;
    focusMode: boolean;
  },
): WindowHeightDragRegion {
  const scale = resolveMonitorScaleFactor(monitor);
  // Match Rust compute_window_layout: focus / full_work_area / 2+ monitors → full
  // work area; single non-teaching → bottom half.
  const useFull = opts.focusMode || opts.fullWorkArea || opts.multiMonitor;
  const regionY = useFull ? monitor.y : monitor.y + Math.floor(monitor.height / 2);
  const regionH = useFull ? monitor.height : Math.floor(monitor.height / 2);
  return {
    bottom: (regionY + regionH) / scale,
    height: regionH / scale,
  };
}

/**
 * Map absolute screen Y to height ratio so the window top tracks the cursor.
 * Bottom edge stays fixed: taller when the pointer is higher on the screen.
 */
export function nextWindowHeightRatioFromScreenY(
  screenY: number,
  region: WindowHeightDragRegion,
): number {
  if (region.height <= 0) return clampWindowHeightRatio(0);
  return clampWindowHeightRatio((region.bottom - screenY) / region.height);
}

/** End a height-grip drag on matching window pointerup/pointercancel. */
export function attachWindowHeightPointerEndListeners(
  pointerId: number,
  onMatchingEnd: () => void,
): () => void {
  const handler = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    onMatchingEnd();
  };
  window.addEventListener("pointerup", handler);
  window.addEventListener("pointercancel", handler);
  return () => {
    window.removeEventListener("pointerup", handler);
    window.removeEventListener("pointercancel", handler);
  };
}
