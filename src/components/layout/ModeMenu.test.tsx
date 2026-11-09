// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";
import { APP_MODE_OPTIONS } from "../../lib/appModeLayout";

const motionMocks = vi.hoisted(() => ({
  prefersReducedMotion: vi.fn(() => true),
}));

const handleCloseApp = vi.hoisted(() => vi.fn());

const closeModeMenu = vi.fn(async () => {
  storeState.modeMenuOpen = false;
});
const setAppMode = vi.fn(async () => undefined);

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
  modeMenuOpen: true,
  closeModeMenu,
  setAppMode,
};

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

vi.mock("./appShellUtils", () => ({
  handleCloseApp,
}));

let companionEnabled = false;

import { ModeMenu } from "./ModeMenu";

function menuitemButtons(): HTMLButtonElement[] {
  return Array.from(
    screen
      .getByRole("menu")
      .querySelectorAll<HTMLButtonElement>("button[role^='menuitem']"),
  );
}

describe("ModeMenu Close app row", () => {
  beforeEach(() => {
    closeModeMenu.mockClear();
    closeModeMenu.mockImplementation(async () => {
      storeState.modeMenuOpen = false;
    });
    setAppMode.mockReset();
    handleCloseApp.mockReset();
    companionEnabled = false;
    storeState.modeMenuOpen = true;
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
    motionMocks.prefersReducedMotion.mockReturnValue(true);
  });

  it("lists Close app last, with Show keyboard first and the same mode radios", () => {
    render(<ModeMenu onShowKeyboard={() => {}} />);
    const items = menuitemButtons();
    expect(items[0]?.textContent).toBe("Show keyboard");
    expect(items[items.length - 1]?.textContent).toBe("Close app");
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(
      APP_MODE_OPTIONS.length,
    );
  });

  it("clicking Close app closes the menu then quits", async () => {
    let resolveClose: () => void = () => {};
    closeModeMenu.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );
    render(<ModeMenu onShowKeyboard={() => {}} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Close app" }));
    expect(closeModeMenu).toHaveBeenCalledTimes(1);
    expect(handleCloseApp).not.toHaveBeenCalled();
    resolveClose();
    await waitFor(() => {
      expect(handleCloseApp).toHaveBeenCalledTimes(1);
    });
  });

  it("still quits when closing the menu fails", async () => {
    closeModeMenu.mockImplementationOnce(async () => {
      throw new Error("layout");
    });
    render(<ModeMenu onShowKeyboard={() => {}} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Close app" }));
    await waitFor(() => {
      expect(handleCloseApp).toHaveBeenCalledTimes(1);
    });
  });
});
