/** Collapsed FAB geometry — keep in sync with src-tauri/src/window/mod.rs */

export const COLLAPSED_FAB_SIZE = 56;
export const COLLAPSED_FAB_GAP = 12;
export const COLLAPSED_FAB_PAD = 10;
/** Extra px for hover scale headroom (~5% of 56px). */
export const FAB_HOVER_SLACK = 6;

export type CollapsedFabCount = 1 | 2 | 3;

function collapsedFabStackHeight(count: CollapsedFabCount): number {
  switch (count) {
    case 1:
      return COLLAPSED_FAB_SIZE;
    case 2:
      return COLLAPSED_FAB_SIZE * 2 + COLLAPSED_FAB_GAP;
    case 3:
      return COLLAPSED_FAB_SIZE * 3 + COLLAPSED_FAB_GAP * 2;
    default: {
      const _exhaustive: never = count;
      return _exhaustive;
    }
  }
}

/** Minimum content area inside padding; matches Rust compute_collapsed_dimensions minus pad. */
export function collapsedFabContentMinSize(count: CollapsedFabCount): {
  minWidth: number;
  minHeight: number;
} {
  const stackHeight = collapsedFabStackHeight(count);
  return {
    minWidth: COLLAPSED_FAB_SIZE + FAB_HOVER_SLACK,
    minHeight: stackHeight + FAB_HOVER_SLACK,
  };
}
