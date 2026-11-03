import { afterEach, describe, expect, it } from "vitest";
import {
  beginResizeDrag,
  finishResizeDrag,
  recordResizeDragInvoke,
} from "./windowHeightDragSummary";

describe("resize drag summary counters", () => {
  afterEach(() => {
    finishResizeDrag(0, 0);
  });

  it("returns null when finish is called without a start", () => {
    expect(finishResizeDrag(0.5, 1000)).toBeNull();
  });

  it("counts invokes, errors, max invoke ms, and duration", () => {
    beginResizeDrag(0.4, 1000);
    recordResizeDragInvoke(12, true);
    recordResizeDragInvoke(8, false);
    recordResizeDragInvoke(20, true);
    expect(finishResizeDrag(0.7, 2500)).toEqual({
      startRatio: 0.4,
      endRatio: 0.7,
      durationMs: 1500,
      invokes: 3,
      errors: 1,
      maxInvokeMs: 20,
    });
  });

  it("resets counters on a new drag start", () => {
    beginResizeDrag(0.2, 0);
    recordResizeDragInvoke(50, false);
    beginResizeDrag(0.9, 100);
    recordResizeDragInvoke(4, true);
    expect(finishResizeDrag(0.85, 250)).toEqual({
      startRatio: 0.9,
      endRatio: 0.85,
      durationMs: 150,
      invokes: 1,
      errors: 0,
      maxInvokeMs: 4,
    });
  });
});
