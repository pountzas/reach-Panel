// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: "en",
    focusModeOverride: true,
    micMode: false,
    headerBgColor: "#1e293b",
    headerTextColor: "#ffffff",
    keyboardSectionMode: "keyboard",
  },
  companionModeActive: false,
  musicTeachingEnabled: false,
  isAnimatingWindow: false,
  closeModeMenu: vi.fn(async () => undefined),
  setAppMode: vi.fn(async () => undefined),
};

vi.mock("../../stores/appStore", () => {
  const useAppStore = (selector: (s: typeof storeState) => unknown) =>
    selector(storeState);
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

vi.mock("../../hooks/useCompanionTabletEnabled", () => ({
  useCompanionTabletEnabled: () => true,
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120 },
  prefersReducedMotion: () => true,
}));

import { ModeMenu } from "./ModeMenu";

describe("ModeMenu Focus description", () => {
  beforeEach(() => {
    storeState.settings.uiLanguage = "en";
  });

  it("shows modeFocusDescription under Focus only", () => {
    render(<ModeMenu onShowKeyboard={() => undefined} />);
    const focus = screen.getByRole("menuitemradio", { name: "Focus" });
    expect(focus).toHaveTextContent(
      "Keyboard appears when you tap a text field",
    );
    expect(
      screen.getByRole("menuitemradio", { name: "Standard" }),
    ).not.toHaveTextContent("Keyboard appears when you tap a text field");
    expect(focus).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("focus-mode-menu-desc"),
    );
  });
});