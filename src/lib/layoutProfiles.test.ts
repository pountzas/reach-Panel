import { describe, expect, it } from "vitest";
import { createDefaultSectionStack } from "./sectionStack";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";
import {
  applyLayoutSnapshot,
  applySettingsWithLayoutPersist,
  partialContainsLayoutFields,
  persistLayoutForKind,
  POINTER_MOUSE_GUARD_MS,
  pointerKindFromEvent,
  resolveActiveLayout,
  snapshotFromSettings,
  repairStaleFullscreenFlatHeight,
  stripFullscreenHeightFromLayoutSnapshots,
  switchPointerInputKindLayout,
} from "./layoutProfiles";

describe("partialContainsLayoutFields", () => {
  it("does not treat windowHeightRatio as a pointer-kind layout field", () => {
    expect(partialContainsLayoutFields({ windowHeightRatio: undefined })).toBe(
      false,
    );
    expect(partialContainsLayoutFields({ windowHeightRatio: 0.5 })).toBe(false);
  });

  it("detects section stack and input-row ratio", () => {
    expect(partialContainsLayoutFields({ inputRowRightRatio: 0.4 })).toBe(true);
    expect(
      partialContainsLayoutFields({
        sectionStack: createDefaultSectionStack(),
      }),
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
  it("snapshots section and input-row ratios but not window height", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      inputRowRightRatio: 0.35,
      windowHeightRatio: 0.8,
    };
    const snap = snapshotFromSettings(settings);
    expect(snap.inputRowRightRatio).toBe(0.35);
    expect(snap.windowHeightRatio).toBeUndefined();
  });

  it("pointer-kind switch does not change shared windowHeightRatio", () => {
    let settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      windowHeightRatio: 0.4,
      inputRowRightRatio: 0.3,
      mouseLayout: { inputRowRightRatio: 0.3 },
      touchLayout: {
        inputRowRightRatio: 0.55,
        windowHeightRatio: 1.0,
      },
    };
    settings = stripFullscreenHeightFromLayoutSnapshots(settings);
    const switched = switchPointerInputKindLayout(settings, "mouse", "touch");
    expect(switched.windowHeightRatio).toBe(0.4);
    expect(switched.inputRowRightRatio).toBe(0.55);
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

  it("height-only patch does not rewrite pointer-kind snapshots", () => {
    const base: AppSettings = {
      ...DEFAULT_SETTINGS,
      windowHeightRatio: 0.4,
      inputRowRightRatio: 0.28,
      touchLayout: { inputRowRightRatio: 0.4 },
      mouseLayout: { inputRowRightRatio: 0.28 },
    };
    const next = applySettingsWithLayoutPersist(
      base,
      { windowHeightRatio: 0.55 },
      "touch",
    );
    expect(next.windowHeightRatio).toBe(0.55);
    expect(next.touchLayout).toEqual({ inputRowRightRatio: 0.4 });
    expect(next.mouseLayout).toEqual({ inputRowRightRatio: 0.28 });
  });

  it("switchPointerInputKindLayout persists outgoing then restores incoming", () => {
    const mouseStack = createDefaultSectionStack();
    const touchStack = {
      ...createDefaultSectionStack(),
      order: ["teaching"] as ReturnType<
        typeof createDefaultSectionStack
      >["order"],
    };
    const editedMouseStack = {
      ...mouseStack,
      weights: { ...mouseStack.weights, teaching: 5 },
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
    expect(switched.mouseLayout?.sectionStack?.weights.teaching).toBe(5);
    expect(switched.inputRowRightRatio).toBe(0.55);
    expect(switched.sectionStack?.order).toEqual(["teaching"]);

    const back = switchPointerInputKindLayout(switched, "touch", "mouse");
    expect(back.inputRowRightRatio).toBe(0.22);
    expect(back.sectionStack?.weights.teaching).toBe(5);
    expect(back.sectionStack?.order).toEqual(mouseStack.order);
  });
});

describe("pointerKindFromEvent", () => {
  it("maps touch and pen to touch", () => {
    expect(
      pointerKindFromEvent({
        pointerType: "touch",
        isPrimary: true,
        button: 0,
      }),
    ).toBe("touch");
    expect(
      pointerKindFromEvent({
        pointerType: "pen",
        isPrimary: true,
        button: 0,
      }),
    ).toBe("touch");
  });

  it("maps primary left-button mouse to mouse when no recent touch", () => {
    expect(
      pointerKindFromEvent(
        { pointerType: "mouse", isPrimary: true, button: 0 },
        { lastTouchAtMs: null, nowMs: 10_000 },
      ),
    ).toBe("mouse");
  });

  it("ignores mouse within the recent-touch guard", () => {
    const lastTouchAtMs = 5_000;
    expect(
      pointerKindFromEvent(
        { pointerType: "mouse", isPrimary: true, button: 0 },
        { lastTouchAtMs, nowMs: lastTouchAtMs + POINTER_MOUSE_GUARD_MS - 1 },
      ),
    ).toBeNull();
    expect(
      pointerKindFromEvent(
        { pointerType: "mouse", isPrimary: true, button: 0 },
        { lastTouchAtMs, nowMs: lastTouchAtMs + POINTER_MOUSE_GUARD_MS },
      ),
    ).toBe("mouse");
  });

  it("ignores non-primary or non-left mouse buttons", () => {
    expect(
      pointerKindFromEvent({
        pointerType: "mouse",
        isPrimary: false,
        button: 0,
      }),
    ).toBeNull();
    expect(
      pointerKindFromEvent({
        pointerType: "mouse",
        isPrimary: true,
        button: 2,
      }),
    ).toBeNull();
  });

  it("ignores unknown pointer types", () => {
    expect(
      pointerKindFromEvent({
        pointerType: "",
        isPrimary: true,
        button: 0,
      }),
    ).toBeNull();
  });
});

describe("repairStaleFullscreenFlatHeight", () => {
  it("clears flat 1.0 when a snapshot also has stale fullscreen height", () => {
    const { settings, repaired } = repairStaleFullscreenFlatHeight({
      ...DEFAULT_SETTINGS,
      windowHeightRatio: 1.0,
      touchLayout: { windowHeightRatio: 1.0, inputRowRightRatio: 0.4 },
    });
    expect(repaired).toBe(true);
    expect(settings.windowHeightRatio).toBeUndefined();
    expect(settings.touchLayout?.windowHeightRatio).toBe(1.0);
  });

  it("leaves deliberate flat height alone when snapshots are not stale", () => {
    const { settings, repaired } = repairStaleFullscreenFlatHeight({
      ...DEFAULT_SETTINGS,
      windowHeightRatio: 1.0,
      touchLayout: { inputRowRightRatio: 0.4, windowHeightRatio: 0.5 },
    });
    expect(repaired).toBe(false);
    expect(settings.windowHeightRatio).toBe(1.0);
  });
});
