export type SectionId = "quick-actions" | "phrases" | "input-row";

export interface SectionLayout {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  minimized?: boolean;
  expandedHPct?: number;
}

export const SECTION_HEADER_HEIGHT_PX = 28;

export type SectionLayouts = Partial<Record<SectionId, SectionLayout>>;

export interface SectionVisibility {
  quickActions: boolean;
  phrases: boolean;
}

const GAP_PCT = 1;
const MIN_W_PCT = 15;
const MIN_H_PCT = 10;

/** Default band sizes as fractions of full keyboard region height. */
const QUICK_ACTIONS_HEIGHT_RATIO = 0.1;
const PHRASES_HEIGHT_RATIO = 0.38;
const GAP_HEIGHT_RATIO = GAP_PCT / 100;
/** Minimum window height so header + input-row stay usable. */
const MIN_CONTENT_HEIGHT_RATIO = 0.5;

/**
 * Fraction of the full keyboard region height needed for the currently
 * visible sections. All visible → 1.0; hiding phrases/QA shrinks the window.
 */
export function computeContentHeightRatio(visible: SectionVisibility): number {
  if (visible.quickActions && visible.phrases) {
    return 1;
  }

  let ratio = 1;
  if (!visible.phrases) {
    ratio -= PHRASES_HEIGHT_RATIO + GAP_HEIGHT_RATIO;
  }
  if (!visible.quickActions) {
    ratio -= QUICK_ACTIONS_HEIGHT_RATIO + GAP_HEIGHT_RATIO;
  }

  return Math.max(MIN_CONTENT_HEIGHT_RATIO, Math.min(1, ratio));
}

function clampLayout(layout: SectionLayout): SectionLayout {
  const wPct = Math.max(MIN_W_PCT, Math.min(100 - GAP_PCT * 2, layout.wPct));
  const hPctMin = layout.minimized ? 0 : MIN_H_PCT;
  const hPct = Math.max(hPctMin, Math.min(100 - GAP_PCT * 2, layout.hPct));
  const xPct = Math.max(GAP_PCT, Math.min(100 - wPct - GAP_PCT, layout.xPct));
  const yPct = Math.max(GAP_PCT, Math.min(100 - hPct - GAP_PCT, layout.yPct));
  return {
    xPct,
    yPct,
    wPct,
    hPct,
    minimized: layout.minimized,
    expandedHPct: layout.expandedHPct,
  };
}

function headerHeightPct(containerHeight: number): number {
  return (SECTION_HEADER_HEIGHT_PX / containerHeight) * 100;
}

export function effectiveSectionHeight(
  layout: SectionLayout,
  containerHeight: number,
): number {
  if (layout.minimized) {
    return SECTION_HEADER_HEIGHT_PX;
  }
  return (layout.hPct / 100) * containerHeight;
}

export function toggleSectionMinimized(
  layout: SectionLayout,
  containerHeight: number,
): SectionLayout {
  if (layout.minimized) {
    return {
      ...layout,
      minimized: false,
      hPct: layout.expandedHPct ?? layout.hPct,
    };
  }
  return {
    ...layout,
    minimized: true,
    expandedHPct: layout.hPct,
    hPct: headerHeightPct(containerHeight),
  };
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

/** Visible section ids for the current visibility flags (always includes input-row). */
export function visibleSectionIds(visible: SectionVisibility): SectionId[] {
  const ids: SectionId[] = [];
  if (visible.quickActions) ids.push("quick-actions");
  if (visible.phrases) ids.push("phrases");
  ids.push("input-row");
  return ids;
}

/**
 * True when saved layouts do not retain entries for currently hidden sections.
 * Missing keys for visible sections are fine (defaults fill them in).
 */
export function layoutsMatchVisibility(
  saved: SectionLayouts | undefined,
  visible: SectionVisibility,
): boolean {
  if (!saved) return true;
  if (saved["quick-actions"] && !visible.quickActions) return false;
  if (saved.phrases && !visible.phrases) return false;
  return true;
}

/**
 * Detects a leftover gap after hide/reload — e.g. input-row still sits below a
 * missing phrases band, or the topmost section is parked too far down the canvas.
 */
export function hasStaleGap(
  saved: SectionLayouts | undefined,
  visible: SectionVisibility,
): boolean {
  if (!saved || Object.keys(saved).length === 0) return false;
  if (!layoutsMatchVisibility(saved, visible)) return true;

  const defaults = computeDefaultSectionLayouts(visible);
  const input = saved["input-row"];
  if (!input) return false;

  const defaultInput = defaults["input-row"];
  // Input row still parked where a hidden band used to be (large Y offset vs default).
  if (input.yPct > defaultInput.yPct + GAP_PCT * 2 + 5) {
    return true;
  }

  // Topmost visible section should start near the top of the canvas.
  const topId = visibleSectionIds(visible)[0];
  const top = saved[topId];
  if (top && top.yPct > GAP_PCT * 3) {
    return true;
  }

  return false;
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
