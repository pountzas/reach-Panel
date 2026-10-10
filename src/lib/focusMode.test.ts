import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type MonitorInfo } from "./types";
import {
  isInputPreviewActiveForMode,
  isMirroredSetup,
  isFocusModeEligible,
  isTransparentUiActive,
  focusModeToolbarClassName,
  monitorsOverlap,
  nextTransparentKeyColor,
  resolveFocusModeEnabled,
  transparentKeyPalette,
  transparentOutlineStyle,
} from "./focusMode";

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

describe("focusMode", () => {
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
    expect(isFocusModeEligible([])).toBe(false);
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: null }, []),
    ).toBe(false);
  });

  it("null override stays Normal even on single monitor (Auto dropped)", () => {
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: null }, [a]),
    ).toBe(false);
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: undefined }, [a]),
    ).toBe(false);
    expect(isFocusModeEligible([a])).toBe(true);
  });

  it("dual monitor default off unless override", () => {
    const monitors = [a, { ...b, x: 1920 }];
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: null }, monitors),
    ).toBe(false);
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: true }, monitors),
    ).toBe(true);
  });

  it("force off disables focus mode even on single monitor", () => {
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: false }, [a]),
    ).toBe(false);
  });

  it("Focus override + teachingActive true → false", () => {
    expect(
      resolveFocusModeEnabled(
        { ...DEFAULT_SETTINGS, focusModeOverride: true },
        [a],
        true,
      ),
    ).toBe(false);
  });

  it("Focus override + teachingActive false → true", () => {
    expect(
      resolveFocusModeEnabled(
        { ...DEFAULT_SETTINGS, focusModeOverride: true },
        [a],
        false,
      ),
    ).toBe(true);
  });

  it("null override stays Normal on mirrored dual setup (Auto dropped)", () => {
    expect(isFocusModeEligible([a, b])).toBe(true);
    expect(
      resolveFocusModeEnabled({ ...DEFAULT_SETTINGS, focusModeOverride: null }, [a, b]),
    ).toBe(false);
  });

  it("transparent UI only when focus mode active and setting on", () => {
    expect(
      isTransparentUiActive(
        { ...DEFAULT_SETTINGS, focusModeTransparent: true },
        false,
      ),
    ).toBe(false);
    expect(
      isTransparentUiActive(
        { ...DEFAULT_SETTINGS, focusModeTransparent: false },
        true,
      ),
    ).toBe(false);
    expect(
      isTransparentUiActive(
        { ...DEFAULT_SETTINGS, focusModeTransparent: true },
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

  it("transparentOutlineStyle uses selected outline palette", () => {
    const style = transparentOutlineStyle({ outlineColor: "silver" });
    expect(style.border).toContain("#c0c0c0");
    expect(style.color).toBe("#c0c0c0");
  });

  it("cycles transparent key colors", () => {
    expect(nextTransparentKeyColor("white")).toBe("dark-gray");
    expect(nextTransparentKeyColor("dark-gray")).toBe("silver");
    expect(nextTransparentKeyColor("silver")).toBe("white");
    expect(nextTransparentKeyColor(undefined)).toBe("dark-gray");
  });

  it("maps transparent key palette colors", () => {
    expect(transparentKeyPalette("dark-gray")).toEqual({
      border: "#4b5563",
      text: "#4b5563",
    });
  });

  it("input preview follows inputPreviewVisible in mini and normal", () => {
    expect(
      isInputPreviewActiveForMode(
        { ...DEFAULT_SETTINGS, inputPreviewVisible: true },
        true,
      ),
    ).toBe(true);
    expect(
      isInputPreviewActiveForMode(
        { ...DEFAULT_SETTINGS, inputPreviewVisible: true },
        false,
      ),
    ).toBe(true);
  });

  it("input preview stays off in mini even if focus-mode flag is on", () => {
    expect(
      isInputPreviewActiveForMode(
        {
          ...DEFAULT_SETTINGS,
          inputPreviewVisible: false,
          inputPreviewFocusModeVisible: true,
        },
        true,
      ),
    ).toBe(false);
  });

  it("mini toolbar padding insets the height grip from the left like the main header", () => {
    const className = focusModeToolbarClassName(false);
    expect(className.split(/\s+/)).toEqual(
      expect.arrayContaining(["pl-3", "pr-1", "pt-1", "pb-0"]),
    );
    expect(className.split(/\s+/)).not.toContain("gap-1");
  });

  it("keeps suggestion-chip gap when chips are present", () => {
    expect(focusModeToolbarClassName(true).split(/\s+/)).toContain("gap-1");
  });
});
