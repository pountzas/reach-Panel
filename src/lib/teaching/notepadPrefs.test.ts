import { describe, expect, it } from "vitest";
import {
  clampFreeWritePdfZoom,
  clampFreeWriteZoom,
  formatFreeWriteZoomPercent,
  FREE_WRITE_ZOOM_STEP,
} from "./notepadPrefs";

describe("clampFreeWriteZoom", () => {
  it("clamps and snaps to 12.5% steps", () => {
    expect(FREE_WRITE_ZOOM_STEP).toBe(12.5);
    expect(clampFreeWriteZoom(74)).toBe(75);
    expect(clampFreeWriteZoom(201)).toBe(200);
    expect(clampFreeWriteZoom(113)).toBe(112.5);
    expect(clampFreeWriteZoom(87)).toBe(87.5);
    expect(clampFreeWriteZoom(Number.NaN)).toBe(100);
  });
});

describe("clampFreeWritePdfZoom", () => {
  it("clamps and snaps to 12.5% steps within 50–250", () => {
    expect(clampFreeWritePdfZoom(49)).toBe(50);
    expect(clampFreeWritePdfZoom(251)).toBe(250);
    expect(clampFreeWritePdfZoom(106)).toBe(100);
    expect(clampFreeWritePdfZoom(118)).toBe(112.5);
  });
});

describe("formatFreeWriteZoomPercent", () => {
  it("formats whole and half steps", () => {
    expect(formatFreeWriteZoomPercent(100)).toBe("100%");
    expect(formatFreeWriteZoomPercent(87.5)).toBe("87.5%");
  });
});
