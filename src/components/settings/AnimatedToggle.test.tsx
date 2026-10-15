// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AnimatedToggle } from "./AnimatedToggle";
import { getSurfaceColors } from "../../lib/colorProfiles";

const surface = getSurfaceColors("#e5e7eb");

describe("AnimatedToggle", () => {
  it("exposes switch role and toggles on click", () => {
    const onChange = vi.fn();
    render(
      <AnimatedToggle
        checked={false}
        onChange={onChange}
        surface={surface}
        aria-label="Test switch"
      />,
    );
    const sw = screen.getByRole("switch", { name: "Test switch" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(
      <AnimatedToggle
        checked={false}
        onChange={onChange}
        disabled
        surface={surface}
        aria-label="Disabled switch"
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Disabled switch" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
