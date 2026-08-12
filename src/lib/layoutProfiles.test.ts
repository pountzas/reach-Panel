import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";
import {
  applyLayoutSnapshot,
  applySettingsWithLayoutPersist,
  persistLayoutForKind,
  pointerKindFromEvent,
  resolveActiveLayout,
  snapshotFromSettings,
  switchPointerInputKindLayout,
} from "./layoutProfiles";

describe("layoutProfiles", () => {
  it("snapshots current ratios from flat settings", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      inputRowRightRatio: 0.35,
      windowHeightRatio: 0.8,
    };
    const snap = snapshotFromSettings(settings);
    expect(snap.inputRowRightRatio).toBe(0.35);
    expect(snap.windowHeightRatio).toBe(0.8);
  });

  it("persists touch layout without clobbering mouse layout", () => {
    const base = { ...DEFAULT_SETTINGS, inputRowRightRatio: 0.28 };
    const touchApplied = applyLayoutSnapshot(base, { inputRowRightRatio: 0.4 });
    const stored = persistLayoutForKind(touchApplied, "touch");
    expect(stored.touchLayout?.inputRowRightRatio).toBe(0.4);
    expect(stored.mouseLayout?.inputRowRightRatio ?? 0.28).toBe(0.28);
  });

  it("resolveActiveLayout picks touch snapshot when kind is touch", () => {
    const settings = persistLayoutForKind(
      applyLayoutSnapshot(DEFAULT_SETTINGS, { inputRowRightRatio: 0.5 }),
      "touch",
    );
    const resolved = resolveActiveLayout(settings, "touch");
    expect(resolved.inputRowRightRatio).toBe(0.5);
  });

  it("updateSettings persists ratio into active touch layout", () => {
    const base: AppSettings = {
      ...DEFAULT_SETTINGS,
      inputRowRightRatio: 0.28,
      mouseLayout: { inputRowRightRatio: 0.28 },
    };
    const next = applySettingsWithLayoutPersist(
      base,
      { inputRowRightRatio: 0.42 },
      "touch",
    );
    expect(next.inputRowRightRatio).toBe(0.42);
    expect(next.touchLayout?.inputRowRightRatio).toBe(0.42);
    expect(next.mouseLayout?.inputRowRightRatio).toBe(0.28);
  });

  it("switchPointerInputKindLayout persists outgoing then restores incoming", () => {
    let settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      inputRowRightRatio: 0.3,
      mouseLayout: { inputRowRightRatio: 0.3 },
      touchLayout: { inputRowRightRatio: 0.55 },
    };
    // Simulate active mouse editing, then switch to touch.
    settings = applySettingsWithLayoutPersist(
      settings,
      { inputRowRightRatio: 0.22 },
      "mouse",
    );
    const switched = switchPointerInputKindLayout(settings, "mouse", "touch");
    expect(switched.mouseLayout?.inputRowRightRatio).toBe(0.22);
    expect(switched.inputRowRightRatio).toBe(0.55);

    const back = switchPointerInputKindLayout(switched, "touch", "mouse");
    expect(back.inputRowRightRatio).toBe(0.22);
  });

  it("pointerKindFromEvent maps touch vs other", () => {
    expect(pointerKindFromEvent("touch")).toBe("touch");
    expect(pointerKindFromEvent("mouse")).toBe("mouse");
    expect(pointerKindFromEvent("pen")).toBe("mouse");
  });
});
