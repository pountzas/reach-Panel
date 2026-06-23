export type SectionId = "quick-actions" | "phrases" | "input-row";

export interface SectionLayout {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type SectionLayouts = Partial<Record<SectionId, SectionLayout>>;

export interface SectionVisibility {
  quickActions: boolean;
  phrases: boolean;
}

const GAP_PCT = 1;
const MIN_W_PCT = 15;
const MIN_H_PCT = 10;

function clampLayout(layout: SectionLayout): SectionLayout {
  const wPct = Math.max(MIN_W_PCT, Math.min(100 - GAP_PCT * 2, layout.wPct));
  const hPct = Math.max(MIN_H_PCT, Math.min(100 - GAP_PCT * 2, layout.hPct));
  const xPct = Math.max(GAP_PCT, Math.min(100 - wPct - GAP_PCT, layout.xPct));
  const yPct = Math.max(GAP_PCT, Math.min(100 - hPct - GAP_PCT, layout.yPct));
  return { xPct, yPct, wPct, hPct };
}

export function computeDefaultSectionLayouts(
  visible: SectionVisibility,
): Record<SectionId, SectionLayout> {
  const layouts = {} as Record<SectionId, SectionLayout>;
  let y = GAP_PCT;

  if (visible.quickActions) {
    layouts["quick-actions"] = {
      xPct: GAP_PCT,
      yPct: y,
      wPct: 100 - GAP_PCT * 2,
      hPct: 10,
    };
    y += 10 + GAP_PCT;
  }

  if (visible.phrases) {
    layouts.phrases = {
      xPct: GAP_PCT,
      yPct: y,
      wPct: 100 - GAP_PCT * 2,
      hPct: 38,
    };
    y += 38 + GAP_PCT;
  }

  layouts["input-row"] = {
    xPct: GAP_PCT,
    yPct: y,
    wPct: 100 - GAP_PCT * 2,
    hPct: Math.max(20, 100 - y - GAP_PCT),
  };

  return layouts;
}

export function resolveSectionLayouts(
  saved: SectionLayouts | undefined,
  visible: SectionVisibility,
): Record<SectionId, SectionLayout> {
  const defaults = computeDefaultSectionLayouts(visible);
  const resolved = { ...defaults };

  if (saved) {
    for (const id of Object.keys(defaults) as SectionId[]) {
      if (saved[id]) {
        resolved[id] = clampLayout(saved[id]!);
      }
    }
  }

  return resolved;
}

export function layoutToPixels(
  layout: SectionLayout,
  containerWidth: number,
  containerHeight: number,
) {
  return {
    x: (layout.xPct / 100) * containerWidth,
    y: (layout.yPct / 100) * containerHeight,
    width: (layout.wPct / 100) * containerWidth,
    height: (layout.hPct / 100) * containerHeight,
  };
}

export function pixelsToLayout(
  x: number,
  y: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
): SectionLayout {
  return {
    xPct: (x / containerWidth) * 100,
    yPct: (y / containerHeight) * 100,
    wPct: (width / containerWidth) * 100,
    hPct: (height / containerHeight) * 100,
  };
}
