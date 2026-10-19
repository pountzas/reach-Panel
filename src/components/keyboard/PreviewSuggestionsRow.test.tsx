// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const rowSource = readFileSync(join(here, "PreviewSuggestionsRow.tsx"), "utf8");
const indexCss = readFileSync(join(here, "../../index.css"), "utf8");

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

function stubViewTransitionDom() {
  const css = globalThis.CSS as
    | (typeof CSS & { escape?: (value: string) => string })
    | undefined;
  if (typeof css?.escape !== "function") {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        ...(css ?? {}),
        escape(value: string) {
          return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
        },
      },
    });
  }
  if (typeof document.startViewTransition !== "function") {
    document.startViewTransition = ((callback) => {
      const run =
        typeof callback === "function"
          ? callback
          : callback && typeof callback === "object"
            ? callback.update
            : undefined;
      const update = Promise.resolve(run?.());
      return {
        ready: Promise.resolve(),
        update,
        finished: update.then(() => undefined),
        updateCallbackDone: update.then(() => undefined),
        types: new Set<string>(),
        skipTransition() {},
      };
    }) as typeof document.startViewTransition;
  }
}

describe("PreviewSuggestionsRow", () => {
  beforeEach(() => {
    stubViewTransitionDom();
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
    if (!previewSlot) throw new Error("expected preview slot");
    const classes = previewSlot.className.split(/\s+/);
    expect(classes.some((c) => c.startsWith("max-w-"))).toBe(false);
    expect(classes).toContain("w-0");
    expect(previewSlot.getAttribute("aria-hidden")).toBe("true");
  });

  it("adds ml-2 on the suggestions slot only when both are shown", () => {
    storeState.suggestions = ["hello"];
    const both = render(
      <PreviewSuggestionsRow showPreview={true} showSuggestions={true} />,
    );
    const bothSlot = both.container.querySelector("[data-slot='suggestions']");
    if (!bothSlot) throw new Error("expected suggestions slot");
    expect(bothSlot.className.split(/\s+/)).toContain("ml-2");
    both.unmount();

    const chipsOnly = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={true} />,
    );
    const chipsSlot = chipsOnly.container.querySelector(
      "[data-slot='suggestions']",
    );
    if (!chipsSlot) throw new Error("expected suggestions slot");
    expect(chipsSlot.className.split(/\s+/)).not.toContain("ml-2");
  });

  it("keeps both slots mounted when hidden", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    expect(container.querySelector("[data-slot='preview']")).toBeTruthy();
    expect(container.querySelector("[data-slot='suggestions']")).toBeTruthy();
  });

  it("keeps last chips visible while the suggestions slot is hiding", async () => {
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
    await waitFor(() => {
      const slot = container.querySelector("[data-slot='suggestions']");
      expect(slot?.hasAttribute("inert")).toBe(true);
    });
  });

  it("shows the lightbulb with an empty chip list while the slot is open", () => {
    storeState.suggestions = [];
    render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={true} />,
    );
    expect(
      screen.getByRole("img", { name: "Show suggestions bar" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("marks hidden preview slot inert and aria-hidden", () => {
    const { container } = render(
      <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
    );
    const previewSlot = container.querySelector("[data-slot='preview']");
    expect(previewSlot?.getAttribute("aria-hidden")).toBe("true");
    expect(previewSlot?.hasAttribute("inert")).toBe(true);
  });

  it("defers slot visibility so ViewTransition can animate Zustand updates", () => {
    expect(rowSource).toMatch(/useDeferredValue\(\s*showPreview\s*\)/);
    expect(rowSource).toMatch(/useDeferredValue\(\s*showSuggestions\s*\)/);
    expect(rowSource).toMatch(/inert=\{!deferredPreview\}/);
    expect(rowSource).toMatch(/inert=\{!deferredSuggestions\}/);
  });

  it("disables pointer events on the view-transition overlay so taps still hit", () => {
    expect(indexCss).toMatch(
      /::view-transition\s*\{[^}]*pointer-events:\s*none/,
    );
  });
});
