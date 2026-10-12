export const KEYBOARD_FONT_SIZE_DEFAULT = 18;
export const KEYBOARD_FONT_SIZE_MIN = 14;
export const KEYBOARD_FONT_SIZE_PADDING_PX = 4;

export function maxKeyboardFontSize(keyHeight: number): number {
  if (!Number.isFinite(keyHeight) || keyHeight <= 0) {
    return KEYBOARD_FONT_SIZE_MIN;
  }
  return Math.max(
    KEYBOARD_FONT_SIZE_MIN,
    Math.floor(keyHeight - KEYBOARD_FONT_SIZE_PADDING_PX),
  );
}

export function effectiveKeyboardFontSize(
  stored: number | undefined,
  keyHeight: number,
): number {
  const base =
    typeof stored === "number" && Number.isFinite(stored)
      ? stored
      : KEYBOARD_FONT_SIZE_DEFAULT;
  const max = maxKeyboardFontSize(keyHeight);
  return Math.min(Math.max(base, KEYBOARD_FONT_SIZE_MIN), max);
}
