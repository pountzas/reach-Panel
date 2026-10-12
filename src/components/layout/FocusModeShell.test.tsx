// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { MOTION } from "../../lib/motion";

const { notifyFocusContentAnimDone, storeState } = vi.hoisted(() => {
  const storeState = {
    focusModeKeyboardVisible: false,
    focusContentAnim: "idle" as "idle" | "enter" | "exit",
    isAnimatingWindow: false,
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
    storeState.isAnimatingWindow = false;
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      micMode: false,
      focusModeTransparent: false,
      appBgColor: "#f1f5f9",
    };
  });

  it("keeps FAB mounted but hidden while show is applying", () => {
    storeState.focusModeKeyboardVisible = true;
    storeState.focusContentAnim = "idle";
    storeState.isAnimatingWindow = true;
    const { container } = render(<FocusModeShell />);
    const fabLayer = container.querySelector("[data-fab-layer]") as HTMLElement;
    expect(fabLayer.classList.contains("hidden")).toBe(true);
    expect(fabLayer.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("collapsed-fab")).toBeTruthy();
    const layer = document.getElementById("focus-keyboard-layer");
    expect(layer).toBeTruthy();
    expect(layer!.className.split(/\s+/)).toContain("translate-y-full");
    expect(layer!.className.split(/\s+/)).not.toContain("translate-y-0");
  });

  it("keeps FAB mounted but hidden while the keyboard is entering", () => {
    storeState.focusModeKeyboardVisible = true;
    storeState.focusContentAnim = "enter";
    storeState.isAnimatingWindow = true;
    const { container } = render(<FocusModeShell />);
    const fabLayer = container.querySelector("[data-fab-layer]") as HTMLElement;
    expect(fabLayer.classList.contains("hidden")).toBe(true);
    expect(document.getElementById("focus-keyboard-layer")).toBeTruthy();
    expect(screen.getByTestId("keyboard-section")).toBeTruthy();
  });

  it("keeps FAB mounted but hidden while the keyboard is exiting", () => {
    storeState.focusModeKeyboardVisible = false;
    storeState.focusContentAnim = "exit";
    storeState.isAnimatingWindow = true;
    const { container } = render(<FocusModeShell />);
    const fabLayer = container.querySelector("[data-fab-layer]") as HTMLElement;
    expect(fabLayer.classList.contains("hidden")).toBe(true);
    const layer = document.getElementById("focus-keyboard-layer");
    expect(layer).toBeTruthy();
    expect(layer!.className.split(/\s+/)).toContain("translate-y-full");
  });

  it("keeps FAB hidden after exit until the window finishes shrinking", () => {
    storeState.focusModeKeyboardVisible = false;
    storeState.focusContentAnim = "idle";
    storeState.isAnimatingWindow = true;
    const { container } = render(<FocusModeShell />);
    const fabLayer = container.querySelector("[data-fab-layer]") as HTMLElement;
    expect(fabLayer.classList.contains("hidden")).toBe(true);
  });

  it("shows FAB only when the collapsed window is idle", () => {
    storeState.focusModeKeyboardVisible = false;
    storeState.focusContentAnim = "idle";
    storeState.isAnimatingWindow = false;
    const { container } = render(<FocusModeShell />);
    const fabLayer = container.querySelector("[data-fab-layer]") as HTMLElement;
    expect(fabLayer.classList.contains("hidden")).toBe(false);
    expect(fabLayer.classList.contains("absolute")).toBe(true);
    expect(screen.getByTestId("collapsed-fab")).toBeTruthy();
  });

  it("does not notify on a nested child's transform transitionend", () => {
    vi.useFakeTimers();
    storeState.focusModeKeyboardVisible = true;
    storeState.focusContentAnim = "enter";
    render(<FocusModeShell />);
    const layer = document.getElementById("focus-keyboard-layer");
    expect(layer).toBeTruthy();
    fireEvent.transitionEnd(screen.getByTestId("keyboard-section"), {
      propertyName: "transform",
    });
    expect(notifyFocusContentAnimDone).not.toHaveBeenCalled();
    fireEvent.transitionEnd(layer!, { propertyName: "transform" });
    expect(notifyFocusContentAnimDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
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
    vi.advanceTimersByTime(MOTION.focusKeyboard + 80);
    expect(notifyFocusContentAnimDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
