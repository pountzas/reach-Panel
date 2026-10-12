// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    uiLanguage: "en" as const,
  },
  focusModeActive: false,
  inputPreviewFrame: null as string | null,
  externalInputFocused: false,
  suggestions: [] as string[],
  applySuggestion: vi.fn(),
};

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { PreviewSuggestionsRow } from "./PreviewSuggestionsRow";

describe("PreviewSuggestionsRow", () => {
  beforeEach(() => {
    storeState.suggestions = [];
    storeState.externalInputFocused = false;
    storeState.inputPreviewFrame = null;
    storeState.focusModeActive = false;
  });

  it("collapses the preview slot without max-width layout classes", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    const previewSlot = container.querySelector("[data-slot='preview']");
    expect(previewSlot).toBeTruthy();
    const classes = previewSlot!.className.split(/\s+/);
    expect(classes.some((c) => c.startsWith("max-w-"))).toBe(false);
    expect(classes).toContain("w-0");
    expect(previewSlot!.getAttribute("aria-hidden")).toBe("true");
  });

  it("adds ml-2 on the suggestions slot only when both are shown", () => {
    storeState.suggestions = ["hello"];
    const both = render(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={true} />,
    );
    const bothSlot = both.container.querySelector("[data-slot='suggestions']");
    expect(bothSlot!.className.split(/\s+/)).toContain("ml-2");
    both.unmount();

    const chipsOnly = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={true} />,
    );
    const chipsSlot = chipsOnly.container.querySelector(
      "[data-slot='suggestions']",
    );
    expect(chipsSlot!.className.split(/\s+/)).not.toContain("ml-2");
  });

  it("keeps both slots mounted when hidden", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    expect(container.querySelector("[data-slot='preview']")).toBeTruthy();
    expect(container.querySelector("[data-slot='suggestions']")).toBeTruthy();
  });

  it("keeps last chips visible while the suggestions slot is hiding", () => {
    storeState.suggestions = ["alpha", "beta"];
    const { container, rerender } = render(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={true} />,
    );
    expect(screen.getByRole("button", { name: "alpha" })).toBeTruthy();

    storeState.suggestions = [];
    rerender(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={false} />,
    );
    expect(
      screen.getByRole("button", { name: "alpha", hidden: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "beta", hidden: true }),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-slot='suggestions']")!.hasAttribute("inert"),
    ).toBe(true);
  });

  it("marks hidden preview slot inert and aria-hidden", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    const previewSlot = container.querySelector("[data-slot='preview']");
    expect(previewSlot?.getAttribute("aria-hidden")).toBe("true");
    expect(previewSlot!.hasAttribute("inert")).toBe(true);
  });
});
