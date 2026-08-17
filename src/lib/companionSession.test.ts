import { describe, expect, it } from "vitest";
import { mapCompanionSessionPhase } from "./companionSession";

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
