export const KEYBOARD_FONT_SIZE_DEFAULT = 18;
export const KEYBOARD_FONT_SIZE_MIN = 14;
/** ≈160% of the 18px default (issue #228: 80%–160%). */
export const KEYBOARD_FONT_SIZE_MAX = 29;
export const KEYBOARD_FONT_SIZE_PADDING_PX = 4;

/** Clamp a stored value to the Settings slider range (no key-height info needed). */
export function clampKeyboardFontSize(stored: number | undefined): number {
  const base =
    typeof stored === "number" && Number.isFinite(stored)
      ? Math.round(stored)
      : KEYBOARD_FONT_SIZE_DEFAULT;
  return Math.min(
    Math.max(base, KEYBOARD_FONT_SIZE_MIN),
    KEYBOARD_FONT_SIZE_MAX,
  );
}

export function maxKeyboardFontSize(keyHeight: number): number {
  if (!Number.isFinite(keyHeight) || keyHeight <= 0) {
    return KEYBOARD_FONT_SIZE_MIN;
  }
  return Math.min(
    KEYBOARD_FONT_SIZE_MAX,
    Math.max(
      KEYBOARD_FONT_SIZE_MIN,
      Math.floor(keyHeight - KEYBOARD_FONT_SIZE_PADDING_PX),
    ),
  );
}

export function effectiveKeyboardFontSize(
  stored: number | undefined,
  keyHeight: number,
): number {
  const base = clampKeyboardFontSize(stored);
  const max = maxKeyboardFontSize(keyHeight);
  return Math.min(base, max);
}
