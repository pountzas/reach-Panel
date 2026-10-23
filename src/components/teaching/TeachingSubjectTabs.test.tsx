// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../../lib/types";

const storeState = {
  settings: {
    ...DEFAULT_SETTINGS,
    appBgColor: "#e5e7eb",
  },
};

vi.mock("../../stores/appStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { TeachingLessonToolbarButton } from "./TeachingLessonPanel";
import { TeachingSubjectShell } from "./TeachingSubjectShell";

const tabs = [
  {
    id: "spelling" as const,
    label: "Spelling",
    icon: <span data-testid="icon-spelling">S</span>,
  },
  {
    id: "freeWrite" as const,
    label: "Free write",
    icon: <span data-testid="icon-free">F</span>,
  },
];

describe("TeachingSubjectShell vertical rail", () => {
  beforeEach(() => {
    storeState.settings = {
      ...DEFAULT_SETTINGS,
      appBgColor: "#e5e7eb",
    };
  });

  it("renders a vertical tablist with aria-orientation and icon-only tabs", () => {
    const onChange = vi.fn();
    render(
      <TeachingSubjectShell
        orientation="vertical"
        tabs={tabs}
        activeId="spelling"
        onChange={onChange}>
        <div>Body</div>
      </TeachingSubjectShell>,
    );

    const tablist = screen.getByRole("tablist", {
      name: "Teaching subject tabs",
    });
    expect(tablist.getAttribute("aria-orientation")).toBe("vertical");

    const spelling = screen.getByRole("tab", { name: "Spelling" });
    const freeWrite = screen.getByRole("tab", { name: "Free write" });
    expect(spelling.getAttribute("aria-label")).toBe("Spelling");
    expect(freeWrite.getAttribute("aria-label")).toBe("Free write");
    // Icon is the control face; label lives in aria-label + hover tooltip.
    expect(
      spelling.querySelector("[data-testid='icon-spelling']"),
    ).toBeTruthy();
    expect(freeWrite.querySelector("[data-testid='icon-free']")).toBeTruthy();
  });

  it("moves to next tab with ArrowDown and moves focus with selection", () => {
    const onChange = vi.fn();
    render(
      <TeachingSubjectShell
        orientation="vertical"
        tabs={tabs}
        activeId="spelling"
        onChange={onChange}>
        <div>Body</div>
      </TeachingSubjectShell>,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("freeWrite");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Free write" }),
    );
  });

  it("uses roving tabIndex so only the active tab is in the tab order", () => {
    render(
      <TeachingSubjectShell
        orientation="vertical"
        tabs={tabs}
        activeId="spelling"
        onChange={vi.fn()}>
        <div>Body</div>
      </TeachingSubjectShell>,
    );

    expect(screen.getByRole("tab", { name: "Spelling" }).tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Free write" }).tabIndex).toBe(-1);
  });

  it("moves to previous tab with ArrowUp when free write is active", () => {
    const onChange = vi.fn();
    render(
      <TeachingSubjectShell
        orientation="vertical"
        tabs={tabs}
        activeId="freeWrite"
        onChange={onChange}>
        <div>Body</div>
      </TeachingSubjectShell>,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("spelling");
  });

  it("keeps horizontal strip when orientation is omitted", () => {
    render(
      <TeachingSubjectShell tabs={tabs} activeId="spelling" onChange={vi.fn()}>
        <div>Body</div>
      </TeachingSubjectShell>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist.getAttribute("aria-orientation")).not.toBe("vertical");
    expect(screen.getByRole("tab", { name: "Spelling" }).textContent).toContain(
      "Spelling",
    );
  });
});

describe("TeachingLessonToolbarButton size", () => {
  it("uses 32px when size is sm", () => {
    render(
      <TeachingLessonToolbarButton
        label="Zoom out"
        size="sm"
        onClick={() => undefined}
        backgroundColor="#fff"
        borderColor="#ccc"
        color="#111">
        <span>−</span>
      </TeachingLessonToolbarButton>,
    );

    const button = screen.getByRole("button", { name: "Zoom out" });
    expect(button.className).toMatch(/\bh-8\b/);
    expect(button.className).toMatch(/\bw-8\b/);
    expect(button.className).not.toMatch(/\bh-10\b/);
  });
});
