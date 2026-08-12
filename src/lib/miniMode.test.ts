import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type MonitorInfo } from "./types";
import {
  isMirroredSetup,
  isMiniModeEligible,
  isTransparentUiActive,
  monitorsOverlap,
  resolveMiniModeEnabled,
  transparentOutlineStyle,
} from "./miniMode";

const a: MonitorInfo = {
  id: 0,
  name: "A",
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  is_primary: true,
};

const b: MonitorInfo = {
  id: 1,
  name: "B",
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  is_primary: false,
};

describe("miniMode", () => {
  it("detects mirrored monitors by overlapping work areas", () => {
    expect(isMirroredSetup([a, b])).toBe(true);
    expect(monitorsOverlap(a, b)).toBe(true);
  });

  it("does not treat side-by-side monitors as mirrored", () => {
    const sideBySide: MonitorInfo = { ...b, x: 1920 };
    expect(isMirroredSetup([a, sideBySide])).toBe(false);
    expect(monitorsOverlap(a, sideBySide)).toBe(false);
  });

  it("empty monitor list is not eligible", () => {
    expect(isMiniModeEligible([])).toBe(false);
    expect(
      resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: null }, []),
    ).toBe(false);
  });

  it("auto-enables mini mode on single monitor", () => {
    expect(
      resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: null }, [a]),
    ).toBe(true);
    expect(isMiniModeEligible([a])).toBe(true);
  });

  it("dual monitor default off unless override", () => {
    const monitors = [a, { ...b, x: 1920 }];
    expect(
      resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: null }, monitors),
    ).toBe(false);
    expect(
      resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: true }, monitors),
    ).toBe(true);
  });

  it("force off disables mini mode even on single monitor", () => {
    expect(
      resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: false }, [a]),
    ).toBe(false);
  });

  it("auto-enables mini mode on mirrored dual setup", () => {
    expect(isMiniModeEligible([a, b])).toBe(true);
    expect(
      resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: null }, [a, b]),
    ).toBe(true);
  });

  it("transparent UI only when mini mode active and setting on", () => {
    expect(
      isTransparentUiActive(
        { ...DEFAULT_SETTINGS, miniModeTransparent: true },
        false,
      ),
    ).toBe(false);
    expect(
      isTransparentUiActive(
        { ...DEFAULT_SETTINGS, miniModeTransparent: false },
        true,
      ),
    ).toBe(false);
    expect(
      isTransparentUiActive(
        { ...DEFAULT_SETTINGS, miniModeTransparent: true },
        true,
      ),
    ).toBe(true);
  });

  it("transparentOutlineStyle uses transparent fill and white outline", () => {
    const style = transparentOutlineStyle({ color: "#0f172a" });
    expect(style.backgroundColor).toBe("transparent");
    expect(style.border).toContain("rgba(255,255,255");
    expect(style.textShadow).toContain("rgba(0,0,0");
    expect(style.color).toBe("#0f172a");
  });
});
