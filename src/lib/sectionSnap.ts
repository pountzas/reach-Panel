export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SNAP_THRESHOLD = 10;
export const SECTION_GAP = 4;

export function rectRight(r: PixelRect): number {
  return r.x + r.width;
}

export function rectBottom(r: PixelRect): number {
  return r.y + r.height;
}

export function rectsOverlap(a: PixelRect, b: PixelRect, gap = 0): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function snapScalar(value: number, targets: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold + 1;
  for (const target of targets) {
    const dist = Math.abs(value - target);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  return best;
}

function buildSnapTargets(
  _rect: PixelRect,
  canvasWidth: number,
  canvasHeight: number,
  others: PixelRect[],
) {
  const xForLeftEdge = [0, ...others.flatMap((o) => [o.x, rectRight(o)])];
  const xForRightEdge = [
    canvasWidth,
    ...others.flatMap((o) => [o.x, rectRight(o)]),
  ];
  const yForTopEdge = [0, ...others.flatMap((o) => [o.y, rectBottom(o)])];
  const yForBottomEdge = [
    canvasHeight,
    ...others.flatMap((o) => [o.y, rectBottom(o)]),
  ];

  return { xForLeftEdge, xForRightEdge, yForTopEdge, yForBottomEdge };
}

export function snapRect(
  rect: PixelRect,
  canvasWidth: number,
  canvasHeight: number,
  others: PixelRect[],
  threshold = SNAP_THRESHOLD,
): PixelRect {
  const { xForLeftEdge, xForRightEdge, yForTopEdge, yForBottomEdge } =
    buildSnapTargets(rect, canvasWidth, canvasHeight, others);

  let x = snapScalar(rect.x, xForLeftEdge, threshold);
  let y = snapScalar(rect.y, yForTopEdge, threshold);

  const snappedRight = snapScalar(rectRight(rect), xForRightEdge, threshold);
  if (snappedRight !== rectRight(rect)) {
    x = snappedRight - rect.width;
  }

  const snappedBottom = snapScalar(rectBottom(rect), yForBottomEdge, threshold);
  if (snappedBottom !== rectBottom(rect)) {
    y = snappedBottom - rect.height;
  }

  return { ...rect, x, y };
}

export function clampRectToCanvas(
  rect: PixelRect,
  canvasWidth: number,
  canvasHeight: number,
  minWidth: number,
  minHeight: number,
): PixelRect {
  const width = Math.max(minWidth, Math.min(rect.width, canvasWidth));
  const height = Math.max(minHeight, Math.min(rect.height, canvasHeight));
  const x = Math.max(0, Math.min(rect.x, canvasWidth - width));
  const y = Math.max(0, Math.min(rect.y, canvasHeight - height));
  return { x, y, width, height };
}

function separationMove(
  a: PixelRect,
  b: PixelRect,
  gap: number,
): { dx: number; dy: number; cost: number } | null {
  if (!rectsOverlap(a, b, gap)) return null;

  const options = [
    { dx: b.x - gap - rectRight(a), dy: 0 },
    { dx: rectRight(b) + gap - a.x, dy: 0 },
    { dx: 0, dy: b.y - gap - rectBottom(a) },
    { dx: 0, dy: rectBottom(b) + gap - a.y },
  ];

  let best = options[0];
  let bestCost = Math.abs(best.dx) + Math.abs(best.dy);
  for (const option of options.slice(1)) {
    const cost = Math.abs(option.dx) + Math.abs(option.dy);
    if (cost < bestCost) {
      best = option;
      bestCost = cost;
    }
  }
  return { ...best, cost: bestCost };
}

export function resolveOverlaps(
  rect: PixelRect,
  others: PixelRect[],
  canvasWidth: number,
  canvasHeight: number,
  minWidth: number,
  minHeight: number,
  gap = SECTION_GAP,
): PixelRect {
  let current = { ...rect };
  const maxIterations = Math.max(others.length * 4, 4);

  for (let i = 0; i < maxIterations; i++) {
    let moved = false;
    for (const other of others) {
      const sep = separationMove(current, other, gap);
      if (!sep) continue;
      current = {
        ...current,
        x: current.x + sep.dx,
        y: current.y + sep.dy,
      };
      moved = true;
    }
    if (!moved) break;
  }

  return clampRectToCanvas(current, canvasWidth, canvasHeight, minWidth, minHeight);
}

export function fitsWithoutOverlap(
  rect: PixelRect,
  others: PixelRect[],
  gap = SECTION_GAP,
): boolean {
  return !others.some((other) => rectsOverlap(rect, other, gap));
}

export function adjustRect(
  rect: PixelRect,
  others: PixelRect[],
  canvasWidth: number,
  canvasHeight: number,
  minWidth: number,
  minHeight: number,
): PixelRect {
  const clamped = clampRectToCanvas(
    rect,
    canvasWidth,
    canvasHeight,
    minWidth,
    minHeight,
  );
  const snapped = snapRect(clamped, canvasWidth, canvasHeight, others);

  if (fitsWithoutOverlap(snapped, others)) {
    return snapped;
  }

  const resolved = resolveOverlaps(
    snapped,
    others,
    canvasWidth,
    canvasHeight,
    minWidth,
    minHeight,
  );

  if (fitsWithoutOverlap(resolved, others)) {
    return resolved;
  }

  return snapped;
}
