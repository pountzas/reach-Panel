// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: "en" as const,
  },
  miniModeActive: false,
  inputPreviewFrame: "data:image/jpeg;base64,abc" as string | null,
  externalInputFocused: false,
};

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

import { InputPreview } from "./InputPreview";

describe("InputPreview blank placeholder", () => {
  beforeEach(() => {
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: "en",
    };
    storeState.miniModeActive = false;
    storeState.inputPreviewFrame = "data:image/jpeg;base64,abc";
    storeState.externalInputFocused = false;
  });

  it("renders an empty frame when no text field is focused, even if a stale frame exists", () => {
    render(<InputPreview />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Waiting for preview…")).toBeNull();
    const frame = screen.getByLabelText("No text field selected");
    expect(frame.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps a fixed frame size when unfocused so the layout does not shrink", () => {
    const { unmount } = render(<InputPreview />);
    const blank = screen.getByLabelText("No text field selected") as HTMLElement;
    expect(blank.style.width).toBe("320px");
    expect(blank.style.height).toBe("48px");
    unmount();

    storeState.externalInputFocused = true;
    storeState.inputPreviewFrame = "data:image/jpeg;base64,abc";
    render(<InputPreview />);
    const live = screen.getByLabelText("Target input") as HTMLElement;
    expect(live.style.width).toBe("320px");
    expect(live.style.height).toBe("48px");
  });

  it("shows waiting text when focused and no frame has arrived", () => {
    storeState.externalInputFocused = true;
    storeState.inputPreviewFrame = null;
    render(<InputPreview />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Waiting for preview…")).toBeTruthy();
  });
});
