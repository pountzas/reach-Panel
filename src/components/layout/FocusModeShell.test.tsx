// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { MOTION } from "../../lib/motion";

const { notifyFocusContentAnimDone, storeState } = vi.hoisted(() => {
  const storeState = {
    focusModeKeyboardVisible: false,
    focusContentAnim: "idle" as "idle" | "enter" | "exit",
    settings: {} as typeof DEFAULT_SETTINGS,
    setShowSettings: vi.fn(async () => undefined),
    expandFocusModeKeyboard: vi.fn(async () => undefined),
  };
  return {
    notifyFocusContentAnimDone: vi.fn(),
    storeState,
  };
});

vi.mock("../../stores/appStore", () => {
  const useAppStore = (selector: (s: typeof storeState) => unknown) =>
    selector(storeState);
  return { useAppStore, notifyFocusContentAnimDone };
});

vi.mock("../keyboard/KeyboardSection", () => ({
  KeyboardSection: () => <div data-testid="keyboard-section" />,
}));

vi.mock("./CollapsedFab", () => ({
  CollapsedFab: () => <div data-testid="collapsed-fab" />,
}));

import { FocusModeShell } from "./FocusModeShell";

describe("FocusModeShell", () => {
  beforeEach(() => {
    notifyFocusContentAnimDone.mockReset();
    storeState.focusModeKeyboardVisible = false;
    storeState.focusContentAnim = "idle";
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      micMode: false,
      focusModeTransparent: false,
      appBgColor: "#f1f5f9",
    };
  });

  it("keeps FAB and keyboard layers mounted while the keyboard is entering", () => {
    storeState.focusModeKeyboardVisible = true;
    storeState.focusContentAnim = "enter";
    render(<FocusModeShell />);
    expect(screen.getByTestId("collapsed-fab")).toBeTruthy();
    expect(document.getElementById("focus-keyboard-layer")).toBeTruthy();
    expect(screen.getByTestId("keyboard-section")).toBeTruthy();
  });

  it("keeps both layers mounted while the keyboard is exiting, with the keyboard off-screen", () => {
    storeState.focusModeKeyboardVisible = false;
    storeState.focusContentAnim = "exit";
    render(<FocusModeShell />);
    expect(screen.getByTestId("collapsed-fab")).toBeTruthy();
    const layer = document.getElementById("focus-keyboard-layer");
    expect(layer).toBeTruthy();
    expect(layer!.className.split(/\s+/)).toContain("translate-y-full");
  });

  it("notifies content-anim done once when transform ends even if the fallback timeout also fires", () => {
    vi.useFakeTimers();
    storeState.focusModeKeyboardVisible = true;
    storeState.focusContentAnim = "enter";
    render(<FocusModeShell />);
    const layer = document.getElementById("focus-keyboard-layer");
    expect(layer).toBeTruthy();
    fireEvent.transitionEnd(layer!, { propertyName: "opacity" });
    fireEvent.transitionEnd(layer!, { propertyName: "transform" });
    fireEvent.transitionEnd(layer!, { propertyName: "transform" });
    vi.advanceTimersByTime(MOTION.slow + 50);
    expect(notifyFocusContentAnimDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
