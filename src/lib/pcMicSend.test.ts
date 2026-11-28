import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import {
  DEFAULT_PC_MIC_SEND_MODE,
  formatPcMicCombo,
  pcMicHoldEnabled,
} from "./pcMicSend";

describe("pcMicSend", () => {
  it("defaults to Win+H tap mode", () => {
    expect(DEFAULT_PC_MIC_SEND_MODE).toBe("winH");
    expect(pcMicHoldEnabled(DEFAULT_SETTINGS)).toBe(false);
  });

  it("enables hold for the Right Alt preset", () => {
    expect(
      pcMicHoldEnabled({
        ...DEFAULT_SETTINGS,
        pcMicSendMode: "rightAltHold",
      }),
    ).toBe(true);
  });

  it("formats combos for display", () => {
    expect(formatPcMicCombo(["win", "h"])).toBe("Win + H");
    expect(formatPcMicCombo(["ralt"])).toBe("Right Alt");
  });
});
