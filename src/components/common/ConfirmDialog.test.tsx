// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { ConfirmDialog } from "./ConfirmDialog";

const surface: SurfaceColors = {
  panelBg: "#f8fafc",
  panelHeaderBg: "#e2e8f0",
  panelBorder: "#94a3b8",
  panelText: "#0f172a",
  panelMutedText: "#64748b",
  panelButtonBg: "#e2e8f0",
  insetBg: "#f1f5f9",
  insetBorder: "#cbd5e1",
  insetText: "#475569",
};

const baseProps = {
  message: "Clear the entire notepad draft?",
  confirmLabel: "Clear all",
  cancelLabel: "Cancel",
  surface,
} as const;

describe("ConfirmDialog", () => {
  it("shows a centered dialog with message and action buttons when open", () => {
    render(
      <ConfirmDialog
        open
        {...baseProps}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Clear the entire notepad draft?" });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeTruthy();
  });

  it("does not expose a dialog when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        {...baseProps}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onConfirm when the confirm button is pressed", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open {...baseProps} onConfirm={onConfirm} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is pressed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open {...baseProps} onConfirm={() => {}} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open {...baseProps} onConfirm={() => {}} onCancel={onCancel} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses surface theme colors on the dialog panel", () => {
    render(
      <ConfirmDialog open {...baseProps} onConfirm={() => {}} onCancel={() => {}} />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.style.backgroundColor).toBe("rgb(248, 250, 252)");
    expect(dialog.style.color).toBe("rgb(15, 23, 42)");
  });
});
