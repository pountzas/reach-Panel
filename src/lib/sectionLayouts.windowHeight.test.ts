import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_HEIGHT_RATIO,
  WINDOW_HEIGHT_RATIO_MAX,
  WINDOW_HEIGHT_RATIO_MIN,
  clampWindowHeightRatio,
  resolveWindowHeightRatio,
} from "./sectionLayouts";

describe("resolveWindowHeightRatio", () => {
  it("uses the saved grip ratio when set", () => {
    expect(resolveWindowHeightRatio(0.7)).toBe(0.7);
  });

  it("falls back to the shared default when unset (no content-section snap)", () => {
    expect(resolveWindowHeightRatio(null)).toBe(DEFAULT_WINDOW_HEIGHT_RATIO);
    expect(resolveWindowHeightRatio(undefined)).toBe(DEFAULT_WINDOW_HEIGHT_RATIO);
  });

  it("uses full work area for teaching", () => {
    expect(
      resolveWindowHeightRatio(0.5, { teachingFullWorkArea: true }),
    ).toBe(1);
  });

  it("clamps to 25%–100% of the region", () => {
    expect(WINDOW_HEIGHT_RATIO_MIN).toBe(0.25);
    expect(WINDOW_HEIGHT_RATIO_MAX).toBe(1);
    expect(clampWindowHeightRatio(0.1)).toBe(0.25);
    expect(clampWindowHeightRatio(1.5)).toBe(1);
    expect(resolveWindowHeightRatio(0.1)).toBe(0.25);
  });
});
