// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../lib/dictationOverlayWindow", () => ({
  showDictationOverlay: vi.fn(() => Promise.resolve()),
  hideDictationOverlay: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: vi.fn(() => true),
  afterNextPaint: vi.fn(() => Promise.resolve()),
}));

import { DEFAULT_SETTINGS } from "../lib/types";
import { lessonCloseAppMode } from "../lib/appModeLayout";
import { useAppStore } from "./appStore";
import { peekRestore, peekTeachingRestoreMode } from "./lib/restoreStack";

describe("appStore restoreStack", () => {
  beforeEach(() => {
    useAppStore.setState({ restoreStack: [] });
  });

  it("exposes pushRestore / popRestore for nested mode snapshots", () => {
    const { pushRestore, popRestore } = useAppStore.getState();

    pushRestore("focusMode", { mouseVisible: true });
    pushRestore("teaching", { mode: "focus", windowHeightRatio: 0.65 });
    pushRestore("companion", { mode: "teaching" });

    expect(useAppStore.getState().restoreStack.map((e) => e.reason)).toEqual([
      "focusMode",
      "teaching",
      "companion",
    ]);

    expect(popRestore("companion")).toEqual({ mode: "teaching" });
    expect(popRestore("teaching")).toEqual({
      mode: "focus",
      windowHeightRatio: 0.65,
    });
    expect(
      peekRestore(useAppStore.getState().restoreStack, "focusMode"),
    ).toEqual({ mouseVisible: true });
    expect(popRestore("focusMode")).toEqual({ mouseVisible: true });
    expect(useAppStore.getState().restoreStack).toEqual([]);
  });

  it("does not overwrite an existing reason on pushRestore", () => {
    const { pushRestore } = useAppStore.getState();
    pushRestore("widePiano", { mouseVisible: true });
    pushRestore("widePiano", { mouseVisible: false });
    expect(useAppStore.getState().restoreStack).toEqual([
      { reason: "widePiano", patch: { mouseVisible: true } },
    ]);
  });

  describe("store flows", () => {
    beforeEach(() => {
      useAppStore.setState({
        settings: { ...DEFAULT_SETTINGS },
        restoreStack: [],
        musicTeachingEnabled: false,
        focusModeActive: false,
        companionModeActive: false,
        companionSessionLive: false,
        companionBridgeArmed: false,
        profileHydrated: true,
        isAnimatingWindow: false,
        monitors: [],
      });
    });

    it("Teaching opened from Focus closes back to Focus with the saved height", async () => {
      useAppStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          focusModeOverride: true,
          micMode: false,
          windowHeightRatio: 0.65,
        },
      });

      await useAppStore.getState().setAppMode("teaching");
      const closeMode = peekTeachingRestoreMode(
        useAppStore.getState().restoreStack,
      );
      expect(closeMode).toBe("focus");

      await useAppStore.getState().setAppMode(lessonCloseAppMode(closeMode));

      const state = useAppStore.getState();
      expect(state.settings.focusModeOverride).toBe(true);
      expect(state.settings.micMode).toBe(false);
      expect(state.settings.windowHeightRatio).toBe(0.65);
      expect(peekRestore(state.restoreStack, "teaching")).toBeNull();
    });

    it("a Companion session during wide piano keeps the wide-piano mouse frame", async () => {
      useAppStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          mouseVisible: true,
          synthesizerOctaveCount: 2,
        },
      });
      await useAppStore
        .getState()
        .updateSettings({ synthesizerOctaveCount: 5 });
      expect(useAppStore.getState().settings.mouseVisible).toBe(false);

      await useAppStore.getState().applyCompanionSessionPhase("active");
      expect(
        peekRestore(useAppStore.getState().restoreStack, "companion"),
      ).toEqual({
        mode: "normal",
      });

      await useAppStore.getState().applyCompanionSessionPhase("idle");
      expect(useAppStore.getState().restoreStack.map((e) => e.reason)).toEqual([
        "widePiano",
      ]);

      await useAppStore
        .getState()
        .updateSettings({ synthesizerOctaveCount: 2 });
      expect(useAppStore.getState().settings.mouseVisible).toBe(true);
      expect(useAppStore.getState().restoreStack).toEqual([]);
    });
  });
});
