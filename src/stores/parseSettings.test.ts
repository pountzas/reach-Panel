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

import { DEFAULT_SETTINGS } from "../lib/types";
import { parseSettings } from "./storeShared";

describe("parseSettings", () => {
  it("defaults autoSendLogsWeekly to false and omits lastAutoSendLogsAt", () => {
    expect(DEFAULT_SETTINGS.autoSendLogsWeekly).toBe(false);
    expect(DEFAULT_SETTINGS).not.toHaveProperty("lastAutoSendLogsAt");

    const empty = parseSettings("{}");
    expect(empty.autoSendLogsWeekly).toBe(false);
    expect(empty).not.toHaveProperty("lastAutoSendLogsAt");

    const omitted = parseSettings(JSON.stringify({ uiLanguage: "el" }));
    expect(omitted.autoSendLogsWeekly).toBe(false);
    expect(omitted).not.toHaveProperty("lastAutoSendLogsAt");
  });

  it("round-trips autoSendLogsWeekly and lastAutoSendLogsAt from JSON", () => {
    const settings = parseSettings(
      '{"autoSendLogsWeekly":true,"lastAutoSendLogsAt":"2026-01-01T00:00:00.000Z"}',
    );
    expect(settings.autoSendLogsWeekly).toBe(true);
    expect(settings.lastAutoSendLogsAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not enable auto-send or set a timestamp from non-boolean or empty values", () => {
    const settings = parseSettings(
      JSON.stringify({
        autoSendLogsWeekly: 1,
        lastAutoSendLogsAt: "",
      }),
    );
    expect(settings.autoSendLogsWeekly).toBe(false);
    expect(settings).not.toHaveProperty("lastAutoSendLogsAt");
  });

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
