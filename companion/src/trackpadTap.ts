/** Max finger travel (px) still counted as a tap rather than a drag. */
export const TAP_SLOP_PX = 14;
/** Max press duration for a tap (ms). */
export const TAP_MAX_MS = 350;
/** Window after a tap in which a second tap becomes a double-click (ms). */
export const DOUBLE_TAP_MS = 400;

/** Pure tap vs drag classification (shared with host Trackpad constants). */
export function isTapGesture(travelPx: number, durationMs: number): boolean {
  return travelPx <= TAP_SLOP_PX && durationMs <= TAP_MAX_MS;
}
