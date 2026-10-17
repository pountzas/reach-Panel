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

import { getSongById } from "../../lib/music/songs";
import { useAppStore } from "../appStore";

describe("pianoRangeSlice", () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: {
        ...useAppStore.getState().settings,
        synthesizerOctaveCount: 2,
        synthesizerStartOctave: 3,
      },
    });
  });

  it("fitPianoRangeForSong applies songPianoRangeFit via updateSettings", async () => {
    const song = getSongById("twinkle", []);
    expect(song).not.toBeNull();
    await useAppStore.getState().fitPianoRangeForSong(song!);
    const { settings } = useAppStore.getState();
    expect(settings.synthesizerOctaveCount).toBeGreaterThanOrEqual(2);
    expect(typeof settings.synthesizerStartOctave).toBe("number");
  });
});
