import { describe, expect, it } from "vitest";
import {
  bottomCenterOnMonitor,
  DICTATION_OVERLAY_SIZE,
} from "./dictationOverlayWindow";
import { resolveMonitorScaleFactor } from "./toolWindows";
import type { MonitorInfo } from "./types";

function monitor(partial: Partial<MonitorInfo> & Pick<MonitorInfo, "id">): MonitorInfo {
  return {
    name: `M${partial.id}`,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    is_primary: false,
    ...partial,
  };
}

describe("bottomCenterOnMonitor", () => {
  it("centers horizontally and sits above the bottom edge when scale is 1", () => {
    const m = monitor({ id: 0, width: 1920, height: 1080, is_primary: true });
    const placed = bottomCenterOnMonitor(
      m,
      DICTATION_OVERLAY_SIZE.width,
      DICTATION_OVERLAY_SIZE.height,
      24,
      1,
    );
    expect(placed).toEqual({
      x: Math.round((1920 - 300) / 2),
      y: 1080 - 76 - 24,
      width: 300,
      height: 76,
    });
  });

  it("converts physical monitor rects to logical before placing (150% DPI)", () => {
    // 2880×1800 @ 150% → logical 1920×1200
    const m = monitor({
      id: 1,
      x: 1920,
      y: 0,
      width: 2880,
      height: 1800,
      scale_factor: 1.5,
    });
    const placed = bottomCenterOnMonitor(
      m,
      DICTATION_OVERLAY_SIZE.width,
      DICTATION_OVERLAY_SIZE.height,
    );
    expect(resolveMonitorScaleFactor(m)).toBe(1.5);
    const logicalLeft = 1920 / 1.5;
    const logicalHeight = 1800 / 1.5;
    expect(placed).toEqual({
      x: Math.round(logicalLeft + (1920 - 300) / 2),
      y: Math.round(0 + logicalHeight - 76 - 24),
      width: 300,
      height: 76,
    });
  });

  it("clamps window size to fit a small logical work area", () => {
    const m = monitor({ id: 0, width: 1280, height: 800, is_primary: true });
    const placed = bottomCenterOnMonitor(m, 300, 76, 24, 2);
    // logical 640×400 — window must shrink to fit
    expect(placed.width).toBe(300);
    expect(placed.height).toBe(76);
    expect(placed.x).toBe(Math.round((640 - 300) / 2));
    expect(placed.y).toBe(400 - 76 - 24);
  });

  it("clamps oversized width/height to the logical work area", () => {
    const m = monitor({ id: 0, width: 400, height: 200, is_primary: true });
    const placed = bottomCenterOnMonitor(m, 500, 300, 24, 1);
    expect(placed.width).toBe(400);
    expect(placed.height).toBe(200);
    expect(placed.x).toBe(0);
    // Same formula as centerOnMonitor sizing; margin can push y slightly above the work area top.
    expect(placed.y).toBe(200 - 200 - 24);
  });
});
