import { describe, expect, it } from "vitest";
import {
  KEYBOARD_FONT_SIZE_DEFAULT,
  KEYBOARD_FONT_SIZE_MAX,
  KEYBOARD_FONT_SIZE_MIN,
  clampKeyboardFontSize,
  effectiveKeyboardFontSize,
  maxKeyboardFontSize,
} from "./keyboardFontSize";
import { SPECIAL_KEY_LABELS } from "./keyboardLayouts";

describe("maxKeyboardFontSize", () => {
  it("uses keyHeight minus 4px padding below the cap", () => {
    expect(maxKeyboardFontSize(30)).toBe(26);
  });

  it("caps at KEYBOARD_FONT_SIZE_MAX on tall keys", () => {
    expect(maxKeyboardFontSize(48)).toBe(KEYBOARD_FONT_SIZE_MAX);
    expect(maxKeyboardFontSize(80)).toBe(KEYBOARD_FONT_SIZE_MAX);
  });

  it("floors at MIN when keyHeight minus padding is below MIN", () => {
    expect(maxKeyboardFontSize(28)).toBe(24);
    expect(maxKeyboardFontSize(16)).toBe(KEYBOARD_FONT_SIZE_MIN);
  });
});

describe("clampKeyboardFontSize", () => {
  it("defaults undefined to 18", () => {
    expect(clampKeyboardFontSize(undefined)).toBe(KEYBOARD_FONT_SIZE_DEFAULT);
  });

  it("clamps to the slider range", () => {
    expect(clampKeyboardFontSize(10)).toBe(KEYBOARD_FONT_SIZE_MIN);
    expect(clampKeyboardFontSize(44)).toBe(KEYBOARD_FONT_SIZE_MAX);
    expect(clampKeyboardFontSize(20)).toBe(20);
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

describe("SPECIAL_KEY_LABELS default layouts", () => {
  it("keeps backspace, enter, and shift stacked at default size", () => {
    expect(SPECIAL_KEY_LABELS.backspace.layout).toBe("stack");
    expect(SPECIAL_KEY_LABELS.enter.layout).toBe("stack");
    expect(SPECIAL_KEY_LABELS.shift.layout).toBe("stack");
  });

  it("keeps space as row with open-box symbol", () => {
    expect(SPECIAL_KEY_LABELS.space.layout).toBe("row");
    expect(SPECIAL_KEY_LABELS.space.symbol).toBe("␣");
  });
});
