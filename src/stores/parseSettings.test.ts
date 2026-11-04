import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

import { parseSettings } from "./storeShared";

describe("parseSettings", () => {
  it("strips background image keys from old profiles and otherwise matches", () => {
    const leftover = {
      uiLanguage: "el",
      opacity: 0.8,
    };
    const withImageKeys = parseSettings(
      JSON.stringify({
        ...leftover,
        backgroundImagePath: "C:\\Users\\me\\wallpaper.png",
        backgroundImageOpacity: 0.8,
      }),
    );
    const withoutImageKeys = parseSettings(JSON.stringify(leftover));

    expect(withImageKeys).toEqual(withoutImageKeys);
    expect(withImageKeys).not.toHaveProperty("backgroundImagePath");
    expect(withImageKeys).not.toHaveProperty("backgroundImageOpacity");
  });
});
