import { describe, expect, it } from "vitest";
import { DEFAULT_PHYSICAL_KEY_STATE } from "../../lib/keyboardLayouts";
import { physicalKeyStateEqual } from "./physicalKeyStateEqual";

describe("physicalKeyStateEqual", () => {
  it("returns true for identical states", () => {
    const a = { ...DEFAULT_PHYSICAL_KEY_STATE, pressedVks: [0x10, 0x41] };
    const b = { ...DEFAULT_PHYSICAL_KEY_STATE, pressedVks: [0x10, 0x41] };
    expect(physicalKeyStateEqual(a, b)).toBe(true);
  });

  it("returns false when one field differs", () => {
    const a = { ...DEFAULT_PHYSICAL_KEY_STATE, shift: true };
    const b = { ...DEFAULT_PHYSICAL_KEY_STATE, shift: false };
    expect(physicalKeyStateEqual(a, b)).toBe(false);
  });

  it("returns false when pressedVks lengths differ", () => {
    const a = { ...DEFAULT_PHYSICAL_KEY_STATE, pressedVks: [0x10] };
    const b = { ...DEFAULT_PHYSICAL_KEY_STATE, pressedVks: [0x10, 0x11] };
    expect(physicalKeyStateEqual(a, b)).toBe(false);
  });
});
