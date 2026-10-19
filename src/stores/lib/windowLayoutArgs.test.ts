import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";

const invoke = vi.fn((..._args: unknown[]) => Promise.resolve(undefined));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));
vi.mock("../../lib/motion", () => ({
  prefersReducedMotion: () => true,
}));

import {
  heightRatioFromSettings,
  syncWindowLayoutFromSettings,
  windowLayoutInvokeArgs,
} from "./windowLayoutArgs";

describe("windowLayoutArgs", () => {
  beforeEach(() => {
    invoke.mockClear();
  });

  it("heightRatioFromSettings passes teaching full-work-area into resolve", () => {
    const ratio = heightRatioFromSettings(
      {
        ...DEFAULT_SETTINGS,
        keyboardSectionMode: "synthesizer",
        windowHeightRatio: 0.5,
      },
      true,
    );
    expect(typeof ratio).toBe("number");
  });

  it("windowLayoutInvokeArgs sets fullWorkArea when teaching+synthesizer", () => {
    const args = windowLayoutInvokeArgs(
      { ...DEFAULT_SETTINGS, keyboardSectionMode: "synthesizer" },
      true,
    );
    expect(args.fullWorkArea).toBe(true);
    expect(args.monitorId).toBe(DEFAULT_SETTINGS.accessibilityMonitorId);
  });

  it("syncWindowLayoutFromSettings uses apply when reduced motion", async () => {
    await syncWindowLayoutFromSettings(DEFAULT_SETTINGS, true, false);
    expect(invoke).toHaveBeenCalledWith(
      "cmd_apply_window_layout",
      expect.objectContaining({ collapsed: DEFAULT_SETTINGS.collapsed }),
    );
  });
});
