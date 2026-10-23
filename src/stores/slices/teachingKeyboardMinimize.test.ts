// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(false)),
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

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

vi.mock("../../lib/notify", () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { useAppStore } from "../appStore";

describe("teaching keyboard minimize (ephemeral)", () => {
  beforeEach(() => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      teachingKeyboardMinimized: false,
      teachingKeyboardAutoFocus: false,
    });
  });

  it("defaults off and is not part of settings persistence shape", () => {
    const state = useAppStore.getState();
    expect(state.teachingKeyboardMinimized).toBe(false);
    expect(state.teachingKeyboardAutoFocus).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        state.settings,
        "teachingKeyboardMinimized",
      ),
    ).toBe(false);
  });

  it("enabling Focus forces minimize; disabling Focus keeps minimize", () => {
    useAppStore.getState().setTeachingKeyboardAutoFocus(true);
    expect(useAppStore.getState().teachingKeyboardAutoFocus).toBe(true);
    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(true);

    useAppStore.getState().setTeachingKeyboardAutoFocus(false);
    expect(useAppStore.getState().teachingKeyboardAutoFocus).toBe(false);
    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(true);
  });

  it("resets when leaving Language/Math or disabling Teaching", async () => {
    useAppStore.getState().setTeachingKeyboardAutoFocus(true);
    useAppStore.getState().setTeachingLesson("music");
    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
    expect(useAppStore.getState().teachingKeyboardAutoFocus).toBe(false);

    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      teachingKeyboardMinimized: true,
      teachingKeyboardAutoFocus: true,
    });
    await useAppStore.getState().disableMusicTeaching();
    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
    expect(useAppStore.getState().teachingKeyboardAutoFocus).toBe(false);
  });
});
