// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { MODE_MENU_WIDTH, modeMenuHeight } from "../../lib/focusMode";
import { APP_MODE_OPTIONS } from "../../lib/appModeLayout";

const motionMocks = vi.hoisted(() => ({
  prefersReducedMotion: vi.fn(() => true),
}));

const invoke = vi.fn(async (..._args: unknown[]) => undefined);
const setAppMode = vi.fn(async () => undefined);
const closeModeMenu = vi.fn(async () => {
  storeState.modeMenuOpen = false;
});
const openModeMenu = vi.fn(async () => {
  storeState.modeMenuOpen = true;
  await invoke("cmd_expand_window_for_mode_menu", {
    menuWidth: MODE_MENU_WIDTH,
    menuHeight: modeMenuHeight(1 + APP_MODE_OPTIONS.length),
  });
});
const toggleCollapsed = vi.fn(async () => undefined);
const toggleDictation = vi.fn(async () => undefined);

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: "en",
    focusModeOverride: true,
    micMode: false,
    collapsed: true,
    headerBgColor: "#1e293b",
    headerTextColor: "#ffffff",
  },
  companionModeActive: false,
  musicTeachingEnabled: false,
  isAnimatingWindow: false,
  dictationState: "idle" as const,
  sttCapability: null,
  externalInputFocused: false,
  modeMenuOpen: false,
  openModeMenu,
  closeModeMenu,
  setAppMode,
  toggleCollapsed,
  toggleDictation,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("../../stores/appStore", () => {
  const useAppStore = (selector: (s: typeof storeState) => unknown) =>
    selector(storeState);
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

vi.mock("../../hooks/useCompanionTabletEnabled", () => ({
  useCompanionTabletEnabled: () => companionEnabled,
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: motionMocks.prefersReducedMotion,
}));

let companionEnabled = false;

import { MOTION } from "../../lib/motion";
import { CollapsedFab } from "./CollapsedFab";

describe("CollapsedFab mode menu", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    setAppMode.mockReset();
    setAppMode.mockResolvedValue(undefined);
    closeModeMenu.mockClear();
    openModeMenu.mockClear();
    toggleCollapsed.mockReset();
    toggleDictation.mockReset();
    companionEnabled = false;
    storeState.modeMenuOpen = false;
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: "en",
      focusModeOverride: true,
      micMode: false,
      collapsed: true,
      headerBgColor: "#1e293b",
      headerTextColor: "#ffffff",
      keyboardSectionMode: "keyboard",
    };
    storeState.companionModeActive = false;
    storeState.musicTeachingEnabled = false;
    storeState.isAnimatingWindow = false;
    storeState.sttCapability = null;
    storeState.externalInputFocused = false;
    motionMocks.prefersReducedMotion.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tapping the mode FAB opens the mode menu", async () => {
    const { rerender } = render(<CollapsedFab />);
    const modeFab = screen.getByRole("button", { name: "Choose mode" });
    expect(modeFab.querySelector("img[alt=\"\"][aria-hidden=\"true\"]")).toBeTruthy();
    expect(modeFab.textContent).not.toContain("R");
    fireEvent.click(modeFab);
    expect(openModeMenu).toHaveBeenCalledTimes(1);
    rerender(<CollapsedFab />);
    const menu = screen.getByRole("menu", { name: "Modes" });
    expect(menu).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Show keyboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "Normal" })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "Focus" })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: "Mic" })).toBeTruthy();
    expect(
      screen.getByRole("menuitemradio", { name: "Teaching" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitemradio", { name: "Companion" }),
    ).toBeTruthy();
  });

  it("marks the current mode with aria-checked", () => {
    storeState.modeMenuOpen = true;
    render(<CollapsedFab />);
    expect(
      screen.getByRole("menuitemradio", { name: "Focus" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(
      screen.getByRole("menuitemradio", { name: "Normal" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("false");
  });

  it("picking a different mode calls setAppMode and closes the menu", async () => {
    storeState.modeMenuOpen = true;
    const { rerender } = render(<CollapsedFab />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Normal" }));
    await waitFor(() => {
      expect(closeModeMenu).toHaveBeenCalled();
      expect(setAppMode).toHaveBeenCalledWith("normal");
      expect(toggleCollapsed).toHaveBeenCalledTimes(1);
    });
    storeState.modeMenuOpen = false;
    rerender(<CollapsedFab />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("picking the current mode only closes the menu", async () => {
    storeState.modeMenuOpen = true;
    render(<CollapsedFab />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Focus" }));
    await waitFor(() => { expect(closeModeMenu).toHaveBeenCalled(); });
    expect(setAppMode).not.toHaveBeenCalled();
    expect(toggleCollapsed).not.toHaveBeenCalled();
  });

  it("Show keyboard calls the onExpand prop", async () => {
    storeState.modeMenuOpen = true;
    const onExpand = vi.fn();
    render(<CollapsedFab onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Show keyboard" }));
    await waitFor(() => {
      expect(closeModeMenu).toHaveBeenCalled();
      expect(onExpand).toHaveBeenCalledTimes(1);
    });
  });

  it("Escape closes the menu", () => {
    storeState.modeMenuOpen = true;
    const { rerender } = render(<CollapsedFab />);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(closeModeMenu).toHaveBeenCalled();
    storeState.modeMenuOpen = false;
    rerender(<CollapsedFab />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Companion is disabled when unavailable", () => {
    companionEnabled = false;
    storeState.modeMenuOpen = true;
    render(<CollapsedFab />);
    expect(
      screen.getByRole<HTMLButtonElement>("menuitemradio", { name: "Companion" })
        .disabled,
    ).toBe(true);
  });

  it("keeps the mode menu mounted through the exit animation", async () => {
    motionMocks.prefersReducedMotion.mockReturnValue(false);
    vi.useFakeTimers();
    storeState.modeMenuOpen = true;
    const { rerender } = render(<CollapsedFab />);
    expect(screen.getByRole("menu", { name: "Modes" })).toBeTruthy();

    storeState.modeMenuOpen = false;
    rerender(<CollapsedFab />);
    expect(screen.getByRole("menu", { name: "Modes" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOTION.fast - 1);
    });
    expect(screen.getByRole("menu", { name: "Modes" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("paints FAB stack at full opacity on first frame when motion is reduced", () => {
    motionMocks.prefersReducedMotion.mockReturnValue(true);
    render(<CollapsedFab />);
    const expand = screen.getByRole("button", { name: "Choose mode" });
    expect(expand.style.opacity).toBe("1");
    expect(expand.style.transform).toBe("scale(1)");
  });

  it("staggers FAB appear Mic then Settings then mode logo at 40ms", () => {
    motionMocks.prefersReducedMotion.mockReturnValue(false);
    render(<CollapsedFab showDictation showSettings />);
    const [mic, settingsBtn, expand] = screen.getAllByRole("button");
    const ease = `${MOTION.fast}ms var(--rp-ease-out)`;
    const colorFade = "background-color 200ms ease, color 200ms ease";
    expect(mic.style.transition).toBe(
      `opacity ${ease} 0ms, transform ${ease} 0ms, ${colorFade}`,
    );
    expect(settingsBtn.style.transition).toBe(
      `opacity ${ease} 40ms, transform ${ease} 40ms, ${colorFade}`,
    );
    expect(expand.style.transition).toBe(
      `opacity ${ease} 80ms, transform ${ease} 80ms, ${colorFade}`,
    );
  });
});
