import { describe, expect, it } from "vitest";
import {
  nextWindowHeightRatioFromScreenY,
  resolveWindowHeightDragRegion,
  shouldApplyLiveWindowHeightRatio,
} from "./windowHeightDrag";
import { WINDOW_HEIGHT_RATIO_MAX, WINDOW_HEIGHT_RATIO_MIN } from "./sectionLayouts";
import { V1_HIDDEN_FEATURES, effectiveLargeHeaders } from "./v1HiddenFeatures";
import type { MonitorInfo } from "./types";

const monitor = (partial: Partial<MonitorInfo> & Pick<MonitorInfo, "height">): MonitorInfo => ({
  id: 0,
  name: "Test",
  x: 0,
  y: 0,
  width: 1920,
  is_primary: true,
  scale_factor: 1,
  ...partial,
});

describe("shouldApplyLiveWindowHeightRatio", () => {
  it("allows live height preview when mini mode is active and not collapsed", () => {
    expect(
      shouldApplyLiveWindowHeightRatio({
        collapsed: false,
        miniModeActive: true,
      }),
    ).toBe(true);
  });

  it("skips live height preview when collapsed even outside mini mode", () => {
    expect(
      shouldApplyLiveWindowHeightRatio({
        collapsed: true,
        miniModeActive: false,
      }),
    ).toBe(false);
  });
});

describe("resolveWindowHeightDragRegion", () => {
  it("uses the full work area for mini mode (logical px)", () => {
    const region = resolveWindowHeightDragRegion(
      monitor({ height: 1000, scale_factor: 1 }),
      { fullWorkArea: false, multiMonitor: false, miniMode: true },
    );
    expect(region).toEqual({ bottom: 1000, height: 1000 });
  });

  it("uses the bottom half on a single non-teaching monitor", () => {
    const region = resolveWindowHeightDragRegion(
      monitor({ height: 1000, scale_factor: 1 }),
      { fullWorkArea: false, multiMonitor: false, miniMode: false },
    );
    expect(region).toEqual({ bottom: 1000, height: 500 });
  });

  it("converts physical monitor rects to logical coords via scale_factor", () => {
    const region = resolveWindowHeightDragRegion(
      monitor({ y: 0, height: 1500, scale_factor: 1.5 }),
      { fullWorkArea: true, multiMonitor: false, miniMode: false },
    );
    expect(region.bottom).toBeCloseTo(1000, 10);
    expect(region.height).toBeCloseTo(1000, 10);
  });
});

describe("nextWindowHeightRatioFromScreenY", () => {
  const region = { bottom: 1000, height: 500 };

  it("maps the region top to full height and midpoint to half", () => {
    expect(nextWindowHeightRatioFromScreenY(500, region)).toBe(WINDOW_HEIGHT_RATIO_MAX);
    expect(nextWindowHeightRatioFromScreenY(750, region)).toBeCloseTo(0.5, 10);
  });

  it("clamps when the pointer is above or below the allowed band", () => {
    expect(nextWindowHeightRatioFromScreenY(0, region)).toBe(WINDOW_HEIGHT_RATIO_MAX);
    // Below 1/5 of the region → min ratio 0.2
    expect(nextWindowHeightRatioFromScreenY(950, region)).toBe(WINDOW_HEIGHT_RATIO_MIN);
    expect(WINDOW_HEIGHT_RATIO_MIN).toBe(0.2);
  });

  it("allows shrinking to one-fifth of the region", () => {
    expect(nextWindowHeightRatioFromScreenY(900, region)).toBeCloseTo(0.2, 10);
  });

  it("tracks the cursor absolutely (same screenY → same ratio regardless of prior ratio)", () => {
    expect(nextWindowHeightRatioFromScreenY(600, region)).toBeCloseTo(0.8, 10);
    expect(nextWindowHeightRatioFromScreenY(600, region)).toBeCloseTo(0.8, 10);
  });
});

describe("height grips leave largeHeaders v1-hidden", () => {
  it("keeps largeHeaders hidden so grips replace whole-header drag", () => {
    expect(V1_HIDDEN_FEATURES.largeHeaders).toBe(true);
    expect(effectiveLargeHeaders(true)).toBe(false);
  });
});
