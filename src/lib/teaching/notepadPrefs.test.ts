import { describe, expect, it } from "vitest";
import { clampFreeWriteZoom } from "./notepadPrefs";

describe("clampFreeWriteZoom", () => {
  it("clamps and snaps to 25% steps", () => {
    expect(clampFreeWriteZoom(74)).toBe(75);
    expect(clampFreeWriteZoom(201)).toBe(200);
    expect(clampFreeWriteZoom(113)).toBe(125);
    expect(clampFreeWriteZoom(Number.NaN)).toBe(100);
  });
});
