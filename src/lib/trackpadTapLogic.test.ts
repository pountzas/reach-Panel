import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_MS,
  TAP_MAX_MS,
  TAP_SLOP_PX,
  isTapGesture,
} from "./trackpadTapLogic";

describe("isTapGesture", () => {
  it("accepts short press with little travel", () => {
    expect(isTapGesture(0, 50)).toBe(true);
    expect(isTapGesture(TAP_SLOP_PX, TAP_MAX_MS)).toBe(true);
  });

  it("rejects travel past slop or long press", () => {
    expect(isTapGesture(TAP_SLOP_PX + 1, 50)).toBe(false);
    expect(isTapGesture(0, TAP_MAX_MS + 1)).toBe(false);
  });

  it("keeps double-tap window constant for trackpad parity", () => {
    expect(DOUBLE_TAP_MS).toBe(400);
  });
});
