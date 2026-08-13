export interface RectSize {
  width: number;
  height: number;
}

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PopupPosition {
  left: number;
  top: number;
}

/** Gap between anchor top edge and popup bottom (matches Tailwind mb-1). */
export const LANGUAGE_PICKER_GAP_PX = 4;

/**
 * Position a popup above an anchor, clamped inside the viewport.
 * The popup's bottom edge sits `gap` px above the anchor's top edge.
 */
export function computeLanguagePickerPosition(
  anchor: AnchorRect,
  popup: RectSize,
  viewport: RectSize,
  gap = LANGUAGE_PICKER_GAP_PX,
): PopupPosition {
  let top = anchor.top - gap - popup.height;
  let left = anchor.left;

  if (top < 0) {
    top = 0;
  }

  if (left + popup.width > viewport.width) {
    left = Math.max(0, viewport.width - popup.width);
  }

  if (left < 0) {
    left = 0;
  }

  return { left, top };
}
