import { describe, expect, it } from "vitest";
import { createDefaultSectionStack } from "./sectionStack";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";
import {
  applyLayoutSnapshot,
  applySettingsWithLayoutPersist,
  partialContainsLayoutFields,
  persistLayoutForKind,
  pointerKindFromEvent,
  resolveActiveLayout,
  snapshotFromSettings,
  stripFullscreenHeightFromLayoutSnapshots,
  switchPointerInputKindLayout,
} from "./layoutProfiles";

describe("partialContainsLayoutFields", () => {
  it("treats own-property undefined windowHeightRatio as a layout change", () => {
    expect(
      partialContainsLayoutFields({ windowHeightRatio: undefined }),
    ).toBe(true);
  });

  it("ignores non-layout fields", () => {
    expect(partialContainsLayoutFields({ opacity: 1 })).toBe(false);
  });
});

describe("stripFullscreenHeightFromLayoutSnapshots", () => {
  it("removes Teaching 1.0 from both layouts but keeps normal ratios", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      touchLayout: {
        inputRowRightRatio: 0.4,
        windowHeightRatio: 1.0,
      },
      mouseLayout: {
        inputRowRightRatio: 0.3,
        windowHeightRatio: 0.7,
      },
    };
    const stripped = stripFullscreenHeightFromLayoutSnapshots(settings);
    expect(stripped.touchLayout?.windowHeightRatio).toBeUndefined();
    expect(stripped.touchLayout?.inputRowRightRatio).toBe(0.4);
    expect(stripped.mouseLayout?.windowHeightRatio).toBe(0.7);
    expect(stripped.mouseLayout?.inputRowRightRatio).toBe(0.3);
  });

  it("after strip, pointer switch does not restore 1.0 onto flat settings", () => {
    let settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      inputRowRightRatio: 0.28,
      touchLayout: {
        inputRowRightRatio: 0.4,
        windowHeightRatio: 1.0,
      },
      mouseLayout: {
        inputRowRightRatio: 0.28,
        windowHeightRatio: 1.0,
      },
    };
    settings = stripFullscreenHeightFromLayoutSnapshots(settings);
    delete settings.windowHeightRatio;
    settings = persistLayoutForKind(settings, "mouse");

    const switched = switchPointerInputKindLayout(settings, "mouse", "touch");
    expect(switched.windowHeightRatio).toBeUndefined();
    expect(switched.inputRowRightRatio).toBe(0.4);

    const applied = applyLayoutSnapshot(settings, settings.touchLayout ?? {});
    expect(applied.windowHeightRatio).toBeUndefined();
  });
});

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
    expect(stored.mouseLayout).toBeUndefined();
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
    const mouseStack = createDefaultSectionStack();
    const touchStack = {
      ...createDefaultSectionStack(),
      order: ["phrases", "quick-actions"] as ReturnType<
        typeof createDefaultSectionStack
      >["order"],
    };
    const editedMouseStack = {
      ...mouseStack,
      weights: { ...mouseStack.weights, phrases: 5 },
    };

    let settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      sectionStack: mouseStack,
      inputRowRightRatio: 0.3,
      mouseLayout: { sectionStack: mouseStack, inputRowRightRatio: 0.3 },
      touchLayout: {
        sectionStack: touchStack,
        inputRowRightRatio: 0.55,
      },
    };
    // Simulate active mouse editing, then switch to touch.
    settings = applySettingsWithLayoutPersist(
      settings,
      { sectionStack: editedMouseStack, inputRowRightRatio: 0.22 },
      "mouse",
    );
    const switched = switchPointerInputKindLayout(settings, "mouse", "touch");
    expect(switched.mouseLayout?.inputRowRightRatio).toBe(0.22);
    expect(switched.mouseLayout?.sectionStack?.weights?.phrases).toBe(5);
    expect(switched.inputRowRightRatio).toBe(0.55);
    expect(switched.sectionStack?.order).toEqual(["phrases", "quick-actions"]);

    const back = switchPointerInputKindLayout(switched, "touch", "mouse");
    expect(back.inputRowRightRatio).toBe(0.22);
    expect(back.sectionStack?.weights?.phrases).toBe(5);
    expect(back.sectionStack?.order).toEqual(mouseStack.order);
  });

  it("pointerKindFromEvent maps touch vs other", () => {
    expect(pointerKindFromEvent("touch")).toBe("touch");
    expect(pointerKindFromEvent("mouse")).toBe("mouse");
    expect(pointerKindFromEvent("pen")).toBe("mouse");
  });
});
