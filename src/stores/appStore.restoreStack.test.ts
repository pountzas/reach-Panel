// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(undefined)),
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

import { useAppStore } from "./appStore";
import { peekRestore } from "./lib/restoreStack";

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
    expect(peekRestore(useAppStore.getState().restoreStack, "focusMode")).toEqual(
      { mouseVisible: true },
    );
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
});
