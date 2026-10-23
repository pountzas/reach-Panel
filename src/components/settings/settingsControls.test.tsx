// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getSurfaceColors } from "../../lib/colorProfiles";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../lib/notify", () => ({
  notify: { error: vi.fn() },
}));

import { ToggleRow } from "./settingsControls";

const surface = getSurfaceColors("#e5e7eb");

describe("ToggleRow", () => {
  it("toggles exactly once when the switch is clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow
        label="Row"
        checked={false}
        onChange={onChange}
        surface={surface}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Row" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("toggles exactly once when the label text is clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow label="Row" checked onChange={onChange} surface={surface} />,
    );
    fireEvent.click(screen.getByText("Row"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("ignores clicks when disabled", () => {
    const onChange = vi.fn();
    render(
      <ToggleRow
        label="Row"
        checked={false}
        disabled
        onChange={onChange}
        surface={surface}
      />,
    );
    fireEvent.click(screen.getByText("Row"));
    fireEvent.click(screen.getByRole("switch", { name: "Row" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
