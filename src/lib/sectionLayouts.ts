export type SectionId =
  | "quick-actions"
  | "phrases"
  | "suggestions"
  | "keyboard-mouse";

export interface SectionLayout {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type SectionLayouts = Partial<Record<SectionId, SectionLayout>>;

interface VisibilityFlags {
  quickActions: boolean;
  phrases: boolean;
  suggestions: boolean;
}

const GAP_PCT = 1;

export function computeDefaultSectionLayouts(
  visible: VisibilityFlags,
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

  if (visible.suggestions) {
    layouts.suggestions = {
      xPct: GAP_PCT,
      yPct: y,
      wPct: 100 - GAP_PCT * 2,
      hPct: 12,
    };
    y += 12 + GAP_PCT;
  }

  layouts["keyboard-mouse"] = {
    xPct: GAP_PCT,
    yPct: y,
    wPct: 100 - GAP_PCT * 2,
    hPct: Math.max(20, 100 - y - GAP_PCT),
  };

  return layouts;
}

export function resolveSectionLayouts(
  saved: SectionLayouts | undefined,
  visible: VisibilityFlags,
): Record<SectionId, SectionLayout> {
  const defaults = computeDefaultSectionLayouts(visible);
  const resolved = { ...defaults };

  if (saved) {
    for (const id of Object.keys(defaults) as SectionId[]) {
      if (saved[id]) {
        resolved[id] = saved[id]!;
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
