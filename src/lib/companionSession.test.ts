import { describe, expect, it } from "vitest";
import {
  mapCompanionSessionPhase,
  planCompanionLeave,
  shouldIgnoreCompanionIdle,
  shouldStopCompanionBridgeOnHostMode,
} from "./companionSession";

describe("mapCompanionSessionPhase", () => {
  it("marks active and reconnecting as live", () => {
    expect(mapCompanionSessionPhase("active")).toEqual({ live: true });
    expect(mapCompanionSessionPhase("reconnecting")).toEqual({ live: true });
  });

  it("maps idle to restore HostAppMode", () => {
    expect(mapCompanionSessionPhase("idle", "mini")).toEqual({
      live: false,
      restore: "mini",
    });
    expect(mapCompanionSessionPhase("idle", "teaching")).toEqual({
      live: false,
      restore: "teaching",
    });
    expect(mapCompanionSessionPhase("idle", "normal")).toEqual({
      live: false,
      restore: "normal",
    });
  });

  it('falls back to "normal" when idle and nothing was captured', () => {
    expect(mapCompanionSessionPhase("idle", null)).toEqual({
      live: false,
      restore: "normal",
    });
    expect(mapCompanionSessionPhase("idle")).toEqual({
      live: false,
      restore: "normal",
    });
  });
});

describe("planCompanionLeave", () => {
  it("on session idle while live: restore host mode, keep the bridge armed", () => {
    expect(planCompanionLeave("sessionIdle", true)).toEqual({
      stopBridge: false,
      keepArmed: true,
      restoreHostMode: true,
    });
  });

  it("on session idle after caregiver already left: ignore (do not restore)", () => {
    expect(planCompanionLeave("sessionIdle", false)).toEqual({
      stopBridge: false,
      keepArmed: true,
      restoreHostMode: false,
    });
  });

  it("on caregiver leave: stop the bridge and clear armed; caller owns the next mode", () => {
    expect(planCompanionLeave("caregiverLeft", true)).toEqual({
      stopBridge: true,
      keepArmed: false,
      restoreHostMode: false,
    });
    expect(planCompanionLeave("caregiverLeft", false)).toEqual({
      stopBridge: true,
      keepArmed: false,
      restoreHostMode: false,
    });
  });
});

describe("shouldIgnoreCompanionIdle", () => {
  it("ignores idle when companion is not the selected live mode", () => {
    expect(shouldIgnoreCompanionIdle(false)).toBe(true);
    expect(shouldIgnoreCompanionIdle(true)).toBe(false);
  });
});

describe("shouldStopCompanionBridgeOnHostMode", () => {
  it("stops the bridge when armed or live and the caregiver picks a host mode", () => {
    expect(shouldStopCompanionBridgeOnHostMode(true, false)).toBe(true);
    expect(shouldStopCompanionBridgeOnHostMode(false, true)).toBe(true);
    expect(shouldStopCompanionBridgeOnHostMode(true, true)).toBe(true);
  });

  it("does not stop the bridge when companion was never armed", () => {
    expect(shouldStopCompanionBridgeOnHostMode(false, false)).toBe(false);
  });
});
