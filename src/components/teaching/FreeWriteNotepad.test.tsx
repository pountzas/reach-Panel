// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const clearFreeWriteNotepad = vi.fn();
const setFreeWriteFocus = vi.fn();
const setFreeWriteNotepadText = vi.fn();
const setFreeWriteNotepadZoom = vi.fn();
const setFreeWriteNotepadWrap = vi.fn();
const setFreeWriteNotepadLineNumbers = vi.fn();

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: "en",
    freeWriteNotepadText: "draft notes",
    appBgColor: "#e5e7eb",
  },
  clearFreeWriteNotepad,
  setFreeWriteFocus,
  setFreeWriteNotepadText,
  setFreeWriteNotepadZoom,
  setFreeWriteNotepadWrap,
  setFreeWriteNotepadLineNumbers,
};

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

import { FreeWriteNotepad } from "./FreeWriteNotepad";

describe("FreeWriteNotepad clear all", () => {
  beforeEach(() => {
    clearFreeWriteNotepad.mockReset();
    setFreeWriteFocus.mockReset();
    setFreeWriteNotepadText.mockReset();
    setFreeWriteNotepadZoom.mockReset();
    setFreeWriteNotepadWrap.mockReset();
    setFreeWriteNotepadLineNumbers.mockReset();
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: "en",
      freeWriteNotepadText: "draft notes",
      appBgColor: "#e5e7eb",
    };
  });

  it("opens a themed confirm dialog instead of window.confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FreeWriteNotepad />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Clear the entire notepad draft?" }),
    ).toBeTruthy();
  });

  it("clears the notepad only after confirm", () => {
    render(<FreeWriteNotepad />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(clearFreeWriteNotepad).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear all" }));
    expect(clearFreeWriteNotepad).toHaveBeenCalledTimes(1);
  });

  it("leaves the notepad unchanged when cancel is pressed", () => {
    render(<FreeWriteNotepad />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(clearFreeWriteNotepad).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
