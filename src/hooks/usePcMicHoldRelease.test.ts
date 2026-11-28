// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/types";

const { stopPcMicHold, storeMock } = vi.hoisted(() => ({
  stopPcMicHold: vi.fn(),
  storeMock: {
    pcMicHolding: false,
    externalInputFocused: true,
  },
}));

vi.mock("../stores/appStore", () => ({
  useAppStore: (selector: (s: {
    pcMicHolding: boolean;
    externalInputFocused: boolean;
    stopPcMicHold: () => void;
    settings: typeof DEFAULT_SETTINGS;
  }) => unknown) =>
    selector({
      pcMicHolding: storeMock.pcMicHolding,
      externalInputFocused: storeMock.externalInputFocused,
      stopPcMicHold,
      settings: DEFAULT_SETTINGS,
    }),
}));

import { usePcMicHoldRelease } from "./usePcMicHoldRelease";

describe("usePcMicHoldRelease", () => {
  beforeEach(() => {
    stopPcMicHold.mockClear();
    storeMock.pcMicHolding = false;
    storeMock.externalInputFocused = true;
  });

  it("calls stopPcMicHold on window blur while holding", () => {
    storeMock.pcMicHolding = true;
    renderHook(() => usePcMicHoldRelease());
    window.dispatchEvent(new Event("blur"));
    expect(stopPcMicHold).toHaveBeenCalledTimes(1);
  });

  it("calls stopPcMicHold when externalInputFocused becomes false while holding", () => {
    storeMock.pcMicHolding = true;
    storeMock.externalInputFocused = true;
    const { rerender } = renderHook(() => usePcMicHoldRelease());
    storeMock.externalInputFocused = false;
    rerender();
    expect(stopPcMicHold).toHaveBeenCalledTimes(1);
  });
});