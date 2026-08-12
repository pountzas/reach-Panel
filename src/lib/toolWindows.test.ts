import { describe, expect, it } from "vitest";
import {
  centerOnMonitor,
  resolveMonitorScaleFactor,
  resolveToolWindowMonitor,
  TOOL_WINDOW_SIZE,
} from "./toolWindows";
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

describe("centerOnMonitor", () => {
  it("centers in physical space when scale is 1", () => {
    const m = monitor({ id: 0, width: 1920, height: 1080, is_primary: true });
    const placed = centerOnMonitor(m, 900, 700, 1);
    expect(placed).toEqual({ x: 510, y: 190, width: 900, height: 700 });
  });

  it("converts physical monitor rects to logical before centering (high DPI)", () => {
    // 4K @ 200% → logical 1920×1080 work area
    const m = monitor({ id: 0, width: 3840, height: 2160, is_primary: true });
    const placed = centerOnMonitor(
      m,
      TOOL_WINDOW_SIZE.width,
      TOOL_WINDOW_SIZE.height,
      2,
    );
    expect(placed).toEqual({ x: 510, y: 190, width: 900, height: 700 });
  });

  it("uses the selected monitor scale_factor when current-window DPI would differ", () => {
    // Secondary touchscreen @ 150% while main window might still be on a 100% display.
    const m = monitor({
      id: 1,
      x: 1920,
      y: 0,
      width: 2880,
      height: 1800,
      scale_factor: 1.5,
    });
    const placed = centerOnMonitor(m, TOOL_WINDOW_SIZE.width, TOOL_WINDOW_SIZE.height);
    expect(resolveMonitorScaleFactor(m)).toBe(1.5);
    // logical work area 1920×1200
    expect(placed).toEqual({ x: 1280 + 510, y: 250, width: 900, height: 700 });
  });

  it("clamps window size to fit a small logical work area", () => {
    const m = monitor({ id: 0, width: 1280, height: 800, is_primary: true });
    const placed = centerOnMonitor(m, 900, 700, 2);
    // logical 640×400 — window must shrink to fit
    expect(placed.width).toBe(640);
    expect(placed.height).toBe(400);
    expect(placed.x).toBe(0);
    expect(placed.y).toBe(0);
  });

  it("keeps the window inside an offset monitor in logical coords", () => {
    const m = monitor({
      id: 1,
      x: 1920,
      y: 0,
      width: 1920,
      height: 1080,
    });
    const placed = centerOnMonitor(m, 900, 700, 1.5);
    const logicalLeft = 1920 / 1.5;
    const logicalWidth = 1920 / 1.5;
    expect(placed.x).toBeGreaterThanOrEqual(Math.floor(logicalLeft));
    expect(placed.x + placed.width).toBeLessThanOrEqual(
      Math.ceil(logicalLeft + logicalWidth),
    );
  });
});

describe("resolveToolWindowMonitor", () => {
  it("prefers the preferred id when not a mirror duplicate", () => {
    const monitors = [
      monitor({ id: 0, is_primary: true }),
      monitor({ id: 1, x: 1920 }),
    ];
    expect(resolveToolWindowMonitor(monitors, 1)?.id).toBe(1);
  });

  it("on mirrored duplicates prefers the primary monitor", () => {
    const monitors = [
      monitor({ id: 0, is_primary: true, is_mirror_duplicate: true }),
      monitor({
        id: 1,
        width: 1280,
        height: 720,
        is_mirror_duplicate: true,
      }),
    ];
    expect(resolveToolWindowMonitor(monitors, 1)?.id).toBe(0);
  });

  it("does not pick a monitor from a separated mirrored group", () => {
    // Two independent mirror pairs on different desks / virtual spaces.
    const monitors = [
      monitor({
        id: 0,
        is_primary: true,
        is_mirror_duplicate: true,
        width: 1920,
        height: 1080,
      }),
      monitor({
        id: 1,
        is_mirror_duplicate: true,
        width: 1280,
        height: 720,
      }),
      monitor({
        id: 2,
        x: 5000,
        y: 0,
        is_mirror_duplicate: true,
        width: 2560,
        height: 1440,
      }),
      monitor({
        id: 3,
        x: 5000,
        y: 0,
        is_mirror_duplicate: true,
        width: 1920,
        height: 1080,
      }),
    ];
    // Candidate is id 3 in the second group — must stay in that group (largest: id 2).
    expect(resolveToolWindowMonitor(monitors, 3)?.id).toBe(2);
    // Candidate is id 1 in the first group — prefer primary id 0, never id 2/3.
    expect(resolveToolWindowMonitor(monitors, 1)?.id).toBe(0);
  });

  it("falls back to primary when preferred is missing", () => {
    const monitors = [
      monitor({ id: 0, is_primary: false }),
      monitor({ id: 2, is_primary: true }),
    ];
    expect(resolveToolWindowMonitor(monitors)?.id).toBe(2);
  });
});
