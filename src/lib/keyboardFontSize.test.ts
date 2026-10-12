import { describe, expect, it } from "vitest";
import {
  KEYBOARD_FONT_SIZE_DEFAULT,
  KEYBOARD_FONT_SIZE_MIN,
  effectiveKeyboardFontSize,
  maxKeyboardFontSize,
} from "./keyboardFontSize";
import { SPECIAL_KEY_LABELS } from "./keyboardLayouts";

describe("maxKeyboardFontSize", () => {
  it("uses keyHeight minus 4px padding", () => {
    expect(maxKeyboardFontSize(48)).toBe(44);
  });

  it("floors at MIN when keyHeight minus padding is below MIN", () => {
    expect(maxKeyboardFontSize(28)).toBe(24);
    expect(maxKeyboardFontSize(16)).toBe(KEYBOARD_FONT_SIZE_MIN);
  });
});

describe("effectiveKeyboardFontSize", () => {
  it("defaults undefined to 18 then clamps", () => {
    expect(effectiveKeyboardFontSize(undefined, 48)).toBe(
      KEYBOARD_FONT_SIZE_DEFAULT,
    );
  });

  it("clamps below MIN up to MIN", () => {
    expect(effectiveKeyboardFontSize(10, 48)).toBe(KEYBOARD_FONT_SIZE_MIN);
  });

  it("clamps above max down to max", () => {
    expect(effectiveKeyboardFontSize(40, 30)).toBe(26);
  });

  it("passes through in-range values", () => {
    expect(effectiveKeyboardFontSize(20, 48)).toBe(20);
  });
});

describe("SPECIAL_KEY_LABELS row layout", () => {
  it("uses row for backspace, enter, and shift", () => {
    expect(SPECIAL_KEY_LABELS.backspace.layout).toBe("row");
    expect(SPECIAL_KEY_LABELS.enter.layout).toBe("row");
    expect(SPECIAL_KEY_LABELS.shift.layout).toBe("row");
  });
});
