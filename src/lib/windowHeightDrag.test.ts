import { describe, expect, it } from "vitest";
import {
  nextWindowHeightRatioFromScreenY,
  resolveWindowHeightDragRegion,
  shouldApplyLiveWindowHeightRatio,
} from "./windowHeightDrag";
import { WINDOW_HEIGHT_RATIO_MAX, WINDOW_HEIGHT_RATIO_MIN } from "./sectionLayouts";
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
  it("allows live height when focus keyboard is open even if settings.collapsed", () => {
    expect(
      shouldApplyLiveWindowHeightRatio({
        collapsed: true,
        focusModeActive: true,
        focusModeKeyboardVisible: true,
      }),
    ).toBe(true);
  });

  it("skips live height for focus FAB (keyboard hidden, collapsed)", () => {
    expect(
      shouldApplyLiveWindowHeightRatio({
        collapsed: true,
        focusModeActive: true,
        focusModeKeyboardVisible: false,
      }),
    ).toBe(false);
  });

  it("skips live height preview when collapsed even outside focus mode", () => {
    expect(
      shouldApplyLiveWindowHeightRatio({
        collapsed: true,
        focusModeActive: false,
        focusModeKeyboardVisible: false,
      }),
    ).toBe(false);
  });

  it("allows live height in normal expanded mode", () => {
    expect(
      shouldApplyLiveWindowHeightRatio({
        collapsed: false,
        focusModeActive: false,
        focusModeKeyboardVisible: false,
      }),
    ).toBe(true);
  });
});

describe("resolveWindowHeightDragRegion", () => {
  it("uses the full work area for focus mode (logical px)", () => {
    const region = resolveWindowHeightDragRegion(
      monitor({ height: 1000, scale_factor: 1 }),
      { fullWorkArea: false, multiMonitor: false, focusMode: true },
    );
    expect(region).toEqual({ bottom: 1000, height: 1000 });
  });

  it("uses the bottom half on a single non-teaching monitor", () => {
    const region = resolveWindowHeightDragRegion(
      monitor({ height: 1000, scale_factor: 1 }),
      { fullWorkArea: false, multiMonitor: false, focusMode: false },
    );
    expect(region).toEqual({ bottom: 1000, height: 500 });
  });

  it("converts physical monitor rects to logical coords via scale_factor", () => {
    const region = resolveWindowHeightDragRegion(
      monitor({ y: 0, height: 1500, scale_factor: 1.5 }),
      { fullWorkArea: true, multiMonitor: false, focusMode: false },
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
    // Below 25% of the region → min ratio
    expect(nextWindowHeightRatioFromScreenY(950, region)).toBe(WINDOW_HEIGHT_RATIO_MIN);
    expect(WINDOW_HEIGHT_RATIO_MIN).toBe(0.25);
  });

  it("allows shrinking to 35% of the region", () => {
    expect(nextWindowHeightRatioFromScreenY(825, region)).toBeCloseTo(0.35, 10);
  });

  it("tracks the cursor absolutely (same screenY → same ratio regardless of prior ratio)", () => {
    expect(nextWindowHeightRatioFromScreenY(600, region)).toBeCloseTo(0.8, 10);
    expect(nextWindowHeightRatioFromScreenY(600, region)).toBeCloseTo(0.8, 10);
  });
});
