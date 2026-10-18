import type { PdfPoint, PdfStroke } from "./pdfAnnotations";

function distance(a: PdfPoint, b: PdfPoint): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

/**
 * Brush eraser: drop points within radius of `center`.
 * Keep resulting polylines only when they still have ≥ 2 points.
 * Does not touch text annotations (caller passes strokes only).
 */
export function eraseStrokesWithBrush(
  strokes: PdfStroke[],
  center: PdfPoint,
  radius: number,
): PdfStroke[] {
  let changed = false;
  const next: PdfStroke[] = [];
  for (const stroke of strokes) {
    // Fast path: keep the same object when the brush never touches the stroke
    // so memo(FinishedStrokePolyline) can skip unchanged polylines.
    if (!stroke.points.some((p) => distance(p, center) <= radius)) {
      next.push(stroke);
      continue;
    }
    changed = true;
    const points = stroke.points.filter(
      (p) => distance(p, center) > radius,
    );
    if (points.length >= 2) {
      next.push({ ...stroke, points });
    }
  }
  return changed ? next : strokes;
}
