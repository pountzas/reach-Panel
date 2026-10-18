/** Free write zoom step (notepad + PDF viewer). */
export const FREE_WRITE_ZOOM_STEP = 12.5;

/** Clamp Free write notepad zoom to 75–200% in 12.5% steps. */
export function clampFreeWriteZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  const snapped = Math.round(zoom / FREE_WRITE_ZOOM_STEP) * FREE_WRITE_ZOOM_STEP;
  return Math.min(200, Math.max(75, snapped));
}

/** Clamp PDF viewer zoom to 50–250% in 12.5% steps. */
export function clampFreeWritePdfZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 100;
  const snapped = Math.round(zoom / FREE_WRITE_ZOOM_STEP) * FREE_WRITE_ZOOM_STEP;
  return Math.min(250, Math.max(50, snapped));
}

/** Display zoom without trailing `.0` (e.g. `100%`, `87.5%`). */
export function formatFreeWriteZoomPercent(zoom: number): string {
  const rounded = Math.round(zoom * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}
