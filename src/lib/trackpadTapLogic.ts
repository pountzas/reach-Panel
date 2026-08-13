/** Mirror of companion/src/trackpadTap.ts for host-side unit tests. */
export const TAP_SLOP_PX = 14;
export const TAP_MAX_MS = 350;
export const DOUBLE_TAP_MS = 400;

export function isTapGesture(travelPx: number, durationMs: number): boolean {
  return travelPx <= TAP_SLOP_PX && durationMs <= TAP_MAX_MS;
}
