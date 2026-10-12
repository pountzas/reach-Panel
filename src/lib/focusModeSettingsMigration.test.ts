import { describe, expect, it } from "vitest";
import { migrateLegacyFocusModeSettingsKeys } from "./focusModeSettingsMigration";

describe("migrateLegacyFocusModeSettingsKeys", () => {
  it("maps legacy miniMode* keys onto focusMode* keys", () => {
    expect(
      migrateLegacyFocusModeSettingsKeys({
        miniModeOverride: true,
        miniModeTransparent: true,
        inputPreviewMiniModeVisible: false,
      }),
    ).toEqual({
      focusModeOverride: true,
      focusModeTransparent: true,
      inputPreviewFocusModeVisible: false,
    });
  });

  it("prefers already-migrated focusMode* keys over legacy duplicates", () => {
    expect(
      migrateLegacyFocusModeSettingsKeys({
        miniModeOverride: true,
        focusModeOverride: false,
        miniModeTransparent: true,
        focusModeTransparent: false,
        inputPreviewMiniModeVisible: false,
        inputPreviewFocusModeVisible: true,
      }),
    ).toEqual({
      focusModeOverride: false,
      focusModeTransparent: false,
      inputPreviewFocusModeVisible: true,
    });
  });

  it("leaves unrelated keys untouched", () => {
    expect(
      migrateLegacyFocusModeSettingsKeys({
        uiLanguage: "el",
        collapsed: true,
      }),
    ).toEqual({
      uiLanguage: "el",
      collapsed: true,
    });
  });
});
