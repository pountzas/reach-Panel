import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import {
  DEFAULT_PC_MIC_SEND_MODE,
  formatPcMicCombo,
  normalizePcMicSendMode,
} from "./pcMicSend";

describe("pcMicSend", () => {
  it("defaults to Win+H tap mode", () => {
    expect(DEFAULT_PC_MIC_SEND_MODE).toBe("winH");
    expect(
      normalizePcMicSendMode(DEFAULT_SETTINGS.pcMicSendMode),
    ).toBeUndefined();
  });

  it("migrates legacy rightAltHold to rightAlt", () => {
    expect(normalizePcMicSendMode("rightAltHold")).toBe("rightAlt");
  });

  it("formats combos for display", () => {
    expect(formatPcMicCombo(["win", "h"])).toBe("Win + H");
    expect(formatPcMicCombo(["ralt"])).toBe("Right Alt");
  });
});
