import { describe, expect, it } from "vitest";
import {
  nextWindowHeightRatioFromPointerDelta,
  shouldApplyLiveWindowHeightRatio,
} from "./windowHeightDrag";
import { WINDOW_HEIGHT_RATIO_MAX, WINDOW_HEIGHT_RATIO_MIN } from "./sectionLayouts";
import { V1_HIDDEN_FEATURES, effectiveLargeHeaders } from "./v1HiddenFeatures";

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

describe("nextWindowHeightRatioFromPointerDelta", () => {
  it("grows the window when the pointer moves up", () => {
    expect(nextWindowHeightRatioFromPointerDelta(0.7, 100, 140, 400)).toBeCloseTo(
      0.8,
      10,
    );
  });

  it("clamps to the window height ratio bounds", () => {
    expect(nextWindowHeightRatioFromPointerDelta(0.6, 0, 400, 400)).toBe(
      WINDOW_HEIGHT_RATIO_MAX,
    );
    expect(nextWindowHeightRatioFromPointerDelta(0.6, 400, 0, 400)).toBe(
      WINDOW_HEIGHT_RATIO_MIN,
    );
  });
});

describe("height grips leave largeHeaders v1-hidden", () => {
  it("keeps largeHeaders hidden so grips replace whole-header drag", () => {
    expect(V1_HIDDEN_FEATURES.largeHeaders).toBe(true);
    expect(effectiveLargeHeaders(true)).toBe(false);
  });
});
