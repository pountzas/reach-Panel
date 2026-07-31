import {
  DEFAULT_STACK_ORDER,
  KEYBOARD_SECTION_ID,
  defaultWeightFor,
  getSectionDefinition,
  isStackableSectionId,
  type SectionId,
  type StackableSectionId,
} from "./sectionRegistry";
import {
  SECTION_HEADER_HEIGHT_PX,
  SECTION_HEADER_HEIGHT_LARGE_PX,
  sectionHeaderHeightPx,
} from "./sectionLayouts";

export type { SectionId, StackableSectionId };

export interface FloatRect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface SectionStackState {
  /** Docked order above the keyboard (extensible). */
  order: StackableSectionId[];
  weights: Partial<Record<SectionId, number>>;
  minimized: Partial<Record<SectionId, boolean>>;
  expandedWeights?: Partial<Record<SectionId, number>>;
  /** When present, section floats and leaves a reserved hole in the stack. */
  undocked: Partial<Record<StackableSectionId, FloatRect>>;
}

/** Legacy free-float layout (migration only). */
export interface LegacySectionLayout {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  minimized?: boolean;
  expandedHPct?: number;
}

export type LegacySectionLayouts = Partial<Record<SectionId, LegacySectionLayout>>;

export interface SectionVisibility {
  quickActions: boolean;
  phrases: boolean;
}

export interface DockedSlot {
  id: SectionId;
  y: number;
  height: number;
  isHole: boolean;
  isMinimized: boolean;
}

export const STACK_GAP_PX = 4;
export const MIN_EXPANDED_SECTION_PX = 80;
export const UNDOCK_DRAG_THRESHOLD_PX = 48;
export const SPLITTER_HIT_PX = 6;

const FLOAT_GAP_PCT = 1;
const MIN_FLOAT_W_PCT = 20;
const MIN_FLOAT_H_PCT = 12;

export function createDefaultSectionStack(): SectionStackState {
  return {
    order: [...DEFAULT_STACK_ORDER],
    weights: {
      "quick-actions": defaultWeightFor("quick-actions"),
      phrases: defaultWeightFor("phrases"),
      "input-row": defaultWeightFor("input-row"),
    },
    minimized: {},
    expandedWeights: {},
    undocked: {},
  };
}

export function normalizeStackOrder(
  order: StackableSectionId[] | undefined,
): StackableSectionId[] {
  const seen = new Set<StackableSectionId>();
  const next: StackableSectionId[] = [];
  for (const id of order ?? []) {
    if (!isStackableSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of DEFAULT_STACK_ORDER) {
    if (!seen.has(id)) next.push(id);
  }
  return next;
}

export function normalizeSectionStack(
  stack: SectionStackState | undefined,
): SectionStackState {
  const base = createDefaultSectionStack();
  if (!stack) return base;
  return {
    order: normalizeStackOrder(stack.order),
    weights: { ...base.weights, ...stack.weights },
    minimized: { ...stack.minimized },
    expandedWeights: { ...stack.expandedWeights },
    undocked: { ...stack.undocked },
  };
}

/**
 * Prefer `sectionStack`; otherwise migrate legacy `sectionLayouts`.
 */
export function resolveSectionStack(
  stack: SectionStackState | undefined,
  legacy: LegacySectionLayouts | undefined,
): SectionStackState {
  if (stack && Array.isArray(stack.order)) {
    return normalizeSectionStack(stack);
  }
  if (legacy && Object.keys(legacy).length > 0) {
    return migrateLegacySectionLayouts(legacy);
  }
  return createDefaultSectionStack();
}

export function migrateLegacySectionLayouts(
  legacy: LegacySectionLayouts,
): SectionStackState {
  const next = createDefaultSectionStack();
  for (const id of Object.keys(legacy) as SectionId[]) {
    const layout = legacy[id];
    if (!layout) continue;
    next.weights[id] = Math.max(1, layout.hPct);
    if (layout.minimized) {
      next.minimized[id] = true;
      if (layout.expandedHPct != null) {
        next.expandedWeights = {
          ...next.expandedWeights,
          [id]: Math.max(1, layout.expandedHPct),
        };
      }
    }
  }
  return next;
}

export function isSectionVisible(
  id: SectionId,
  visibility: SectionVisibility,
): boolean {
  const def = getSectionDefinition(id);
  if (def.visibilityKey == null) return true;
  switch (def.visibilityKey) {
    case "quickActions":
      return visibility.quickActions;
    case "phrases":
      return visibility.phrases;
    default: {
      const _exhaustive: never = def.visibilityKey;
      return _exhaustive;
    }
  }
}

export function weightOf(stack: SectionStackState, id: SectionId): number {
  return Math.max(1, stack.weights[id] ?? defaultWeightFor(id));
}

export function isUndocked(
  stack: SectionStackState,
  id: SectionId,
): id is StackableSectionId {
  return isStackableSectionId(id) && stack.undocked[id] != null;
}

/** Visible stack slots including reserved holes for undocked sections. */
export function visibleStackSlotIds(
  stack: SectionStackState,
  visibility: SectionVisibility,
): SectionId[] {
  const ids: SectionId[] = [];
  for (const id of normalizeStackOrder(stack.order)) {
    if (isSectionVisible(id, visibility)) {
      ids.push(id);
    }
  }
  ids.push(KEYBOARD_SECTION_ID);
  return ids;
}

export function resolveDockedSlots(
  stack: SectionStackState,
  visibility: SectionVisibility,
  canvasHeight: number,
  largeHeaders: boolean,
  gapPx: number = STACK_GAP_PX,
): DockedSlot[] {
  const ids = visibleStackSlotIds(stack, visibility);
  if (ids.length === 0 || canvasHeight <= 0) return [];

  const headerH = sectionHeaderHeightPx(largeHeaders);
  const gapsTotal = Math.max(0, ids.length - 1) * gapPx;

  type Plan = {
    id: SectionId;
    kind: "fixed" | "flex";
    fixedH: number;
    isHole: boolean;
    isMinimized: boolean;
  };

  const plan: Plan[] = ids.map((id) => {
    const hole = isUndocked(stack, id);
    const minimized = !hole && Boolean(stack.minimized[id]);
    if (minimized) {
      return {
        id,
        kind: "fixed",
        fixedH: headerH,
        isHole: false,
        isMinimized: true,
      };
    }
    return {
      id,
      kind: "flex",
      fixedH: 0,
      isHole: hole,
      isMinimized: false,
    };
  });

  const fixedTotal = plan.reduce(
    (sum, item) => sum + (item.kind === "fixed" ? item.fixedH : 0),
    0,
  );
  const flexItems = plan.filter((item) => item.kind === "flex");
  const available = Math.max(0, canvasHeight - gapsTotal - fixedTotal);
  const totalWeight = flexItems.reduce(
    (sum, item) => sum + weightOf(stack, item.id),
    0,
  );

  // First pass: ideal heights from weights, then enforce mins by stealing from larger flex slots.
  const heights = new Map<SectionId, number>();
  for (const item of plan) {
    if (item.kind === "fixed") {
      heights.set(item.id, item.fixedH);
    }
  }

  if (flexItems.length > 0 && totalWeight > 0) {
    for (const item of flexItems) {
      const raw = (weightOf(stack, item.id) / totalWeight) * available;
      heights.set(item.id, raw);
    }

    // Enforce minimum expanded height when possible.
    let guard = 0;
    while (guard++ < 8) {
      let deficit = 0;
      const donors: SectionId[] = [];
      for (const item of flexItems) {
        const h = heights.get(item.id) ?? 0;
        if (h + 0.01 < MIN_EXPANDED_SECTION_PX) {
          deficit += MIN_EXPANDED_SECTION_PX - h;
          heights.set(item.id, MIN_EXPANDED_SECTION_PX);
        } else if (h > MIN_EXPANDED_SECTION_PX + 1) {
          donors.push(item.id);
        }
      }
      if (deficit <= 0.5 || donors.length === 0) break;
      const donorWeight = donors.reduce(
        (sum, id) => sum + weightOf(stack, id),
        0,
      );
      for (const id of donors) {
        const share = (weightOf(stack, id) / donorWeight) * deficit;
        heights.set(id, Math.max(MIN_EXPANDED_SECTION_PX, (heights.get(id) ?? 0) - share));
      }
    }

    // If mins exceed available, scale all flex slots down uniformly.
    const flexSum = flexItems.reduce(
      (sum, item) => sum + (heights.get(item.id) ?? 0),
      0,
    );
    if (flexSum > available + 0.5 && flexSum > 0) {
      const scale = available / flexSum;
      for (const item of flexItems) {
        heights.set(item.id, (heights.get(item.id) ?? 0) * scale);
      }
    }
  }

  const slots: DockedSlot[] = [];
  let y = 0;
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i]!;
    const height = Math.max(0, heights.get(item.id) ?? 0);
    slots.push({
      id: item.id,
      y,
      height,
      isHole: item.isHole,
      isMinimized: item.isMinimized,
    });
    y += height;
    if (i < plan.length - 1) y += gapPx;
  }
  return slots;
}

export function applySplitterDelta(
  stack: SectionStackState,
  upperId: SectionId,
  lowerId: SectionId,
  deltaPx: number,
  canvasHeight: number,
  visibility: SectionVisibility,
  largeHeaders: boolean,
): SectionStackState {
  if (deltaPx === 0) return stack;
  const slots = resolveDockedSlots(stack, visibility, canvasHeight, largeHeaders);
  const upper = slots.find((s) => s.id === upperId);
  const lower = slots.find((s) => s.id === lowerId);
  if (!upper || !lower) return stack;
  if (upper.isMinimized || lower.isMinimized) return stack;

  const minH = MIN_EXPANDED_SECTION_PX;

  const nextUpperH = Math.max(minH, upper.height + deltaPx);
  const applied = nextUpperH - upper.height;
  const nextLowerH = Math.max(minH, lower.height - applied);
  const applied2 = lower.height - nextLowerH;
  const finalUpperH = upper.height + applied2;

  const flexSlots = slots.filter((s) => !s.isMinimized);
  const flexTotal = flexSlots.reduce((sum, s) => sum + s.height, 0);
  if (flexTotal <= 0) return stack;

  const totalWeight = flexSlots.reduce(
    (sum, s) => sum + weightOf(stack, s.id),
    0,
  );

  // Map new pixel heights back to weights while preserving total weight among flex slots.
  const nextWeights: Partial<Record<SectionId, number>> = { ...stack.weights };
  for (const slot of flexSlots) {
    let h = slot.height;
    if (slot.id === upperId) h = finalUpperH;
    if (slot.id === lowerId) h = nextLowerH;
    nextWeights[slot.id] = Math.max(1, (h / flexTotal) * totalWeight);
  }

  return { ...stack, weights: nextWeights };
}

export function toggleStackMinimized(
  stack: SectionStackState,
  id: SectionId,
): SectionStackState {
  if (isUndocked(stack, id)) {
    // Minimized state for undocked panels is stored the same way; hole keeps weight.
    const minimized = { ...stack.minimized };
    if (minimized[id]) {
      delete minimized[id];
    } else {
      minimized[id] = true;
    }
    return { ...stack, minimized };
  }

  const minimized = { ...stack.minimized };
  const expandedWeights = { ...stack.expandedWeights };
  if (minimized[id]) {
    delete minimized[id];
    const restored = expandedWeights[id];
    if (restored != null) {
      return {
        ...stack,
        minimized,
        weights: { ...stack.weights, [id]: restored },
        expandedWeights,
      };
    }
    return { ...stack, minimized, expandedWeights };
  }

  expandedWeights[id] = weightOf(stack, id);
  minimized[id] = true;
  return { ...stack, minimized, expandedWeights };
}

export function reorderStack(
  stack: SectionStackState,
  fromId: StackableSectionId,
  toIndex: number,
): SectionStackState {
  const order = normalizeStackOrder(stack.order);
  const fromIndex = order.indexOf(fromId);
  if (fromIndex < 0) return stack;
  const next = [...order];
  next.splice(fromIndex, 1);
  const clamped = Math.max(0, Math.min(next.length, toIndex));
  next.splice(clamped, 0, fromId);
  return { ...stack, order: next };
}

export function undockSection(
  stack: SectionStackState,
  id: StackableSectionId,
  rect: FloatRect,
): SectionStackState {
  if (!getSectionDefinition(id).canUndock) return stack;
  return {
    ...stack,
    undocked: {
      ...stack.undocked,
      [id]: clampFloatRect(rect),
    },
  };
}

export function dockSection(
  stack: SectionStackState,
  id: StackableSectionId,
): SectionStackState {
  if (stack.undocked[id] == null) return stack;
  const undocked = { ...stack.undocked };
  delete undocked[id];
  return { ...stack, undocked };
}

export function updateFloatRect(
  stack: SectionStackState,
  id: StackableSectionId,
  rect: FloatRect,
): SectionStackState {
  if (stack.undocked[id] == null) return stack;
  return {
    ...stack,
    undocked: {
      ...stack.undocked,
      [id]: clampFloatRect(rect),
    },
  };
}

export function clampFloatRect(rect: FloatRect): FloatRect {
  const wPct = Math.max(
    MIN_FLOAT_W_PCT,
    Math.min(100 - FLOAT_GAP_PCT * 2, rect.wPct),
  );
  const hPct = Math.max(
    MIN_FLOAT_H_PCT,
    Math.min(100 - FLOAT_GAP_PCT * 2, rect.hPct),
  );
  const xPct = Math.max(
    FLOAT_GAP_PCT,
    Math.min(100 - wPct - FLOAT_GAP_PCT, rect.xPct),
  );
  const yPct = Math.max(
    FLOAT_GAP_PCT,
    Math.min(100 - hPct - FLOAT_GAP_PCT, rect.yPct),
  );
  return { xPct, yPct, wPct, hPct };
}

export function floatRectToPixels(
  rect: FloatRect,
  containerWidth: number,
  containerHeight: number,
) {
  return {
    x: (rect.xPct / 100) * containerWidth,
    y: (rect.yPct / 100) * containerHeight,
    width: (rect.wPct / 100) * containerWidth,
    height: (rect.hPct / 100) * containerHeight,
  };
}

export function pixelsToFloatRect(
  x: number,
  y: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
): FloatRect {
  return clampFloatRect({
    xPct: (x / containerWidth) * 100,
    yPct: (y / containerHeight) * 100,
    wPct: (width / containerWidth) * 100,
    hPct: (height / containerHeight) * 100,
  });
}

export function defaultFloatRectFromSlot(
  slot: DockedSlot,
  containerWidth: number,
  containerHeight: number,
): FloatRect {
  const width = Math.max(MIN_EXPANDED_SECTION_PX, containerWidth - 16);
  const height = Math.max(MIN_EXPANDED_SECTION_PX, slot.height);
  return pixelsToFloatRect(
    8,
    Math.max(0, slot.y),
    width,
    height,
    containerWidth,
    containerHeight,
  );
}

export function headerHeightFor(largeHeaders: boolean): number {
  return largeHeaders ? SECTION_HEADER_HEIGHT_LARGE_PX : SECTION_HEADER_HEIGHT_PX;
}
