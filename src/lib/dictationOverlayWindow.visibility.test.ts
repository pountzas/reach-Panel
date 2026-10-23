import { beforeEach, describe, expect, it, vi } from "vitest";

const overlayWindow = vi.hoisted(() => {
  let visible = false;
  let releaseShow: (() => void) | null = null;
  return {
    get visible() {
      return visible;
    },
    setVisible(value: boolean) {
      visible = value;
    },
    setReleaseShow(fn: (() => void) | null) {
      releaseShow = fn;
    },
    releaseShow() {
      releaseShow?.();
      releaseShow = null;
    },
    show: vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseShow = resolve;
      });
      visible = true;
    }),
    hide: vi.fn(async () => {
      visible = false;
    }),
    setSize: vi.fn(async () => {}),
    setPosition: vi.fn(async () => {}),
    isVisible: vi.fn(async () => visible),
    outerPosition: vi.fn(async () => ({ x: 0, y: 0 })),
    outerSize: vi.fn(async () => ({ width: 1920, height: 300 })),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "cmd_list_monitors") return [];
    return undefined;
  }),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: vi.fn(async (label: string) => {
      if (label === "dictation-overlay") return overlayWindow;
      return null;
    }),
  },
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

import {
  hideDictationOverlay,
  showDictationOverlay,
} from "./dictationOverlayWindow";

describe("dictation overlay visibility", () => {
  beforeEach(async () => {
    overlayWindow.setVisible(false);
    overlayWindow.setReleaseShow(null);
    overlayWindow.show.mockClear();
    overlayWindow.hide.mockClear();
    await hideDictationOverlay();
  });

  it("hides the overlay when dictation ends while show() is still pending", async () => {
    const showing = showDictationOverlay();
    await vi.waitFor(() => {
      expect(overlayWindow.show).toHaveBeenCalled();
    });

    const hiding = hideDictationOverlay();
    overlayWindow.releaseShow();
    await Promise.all([showing, hiding]);

    expect(overlayWindow.visible).toBe(false);
  });
});
