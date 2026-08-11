import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";
import {
  applyLayoutSnapshot,
  persistLayoutForKind,
  resolveActiveLayout,
  snapshotFromSettings,
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
});
