/** Clamp Free write notepad zoom to 75–200% in 25% steps. */
export function clampFreeWriteZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  return Math.min(200, Math.max(75, Math.round(zoom / 25) * 25));
}
