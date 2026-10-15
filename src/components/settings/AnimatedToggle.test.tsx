// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AnimatedToggle } from "./AnimatedToggle";
import { getSurfaceColors } from "../../lib/colorProfiles";

const surface = getSurfaceColors("#e5e7eb");

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

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

  it("uses panelBg thumb on panelText track so checked contrast holds on dark and light", () => {
    const dark = getSurfaceColors("#374151");
    const light = getSurfaceColors("#e5e7eb");
    expect(dark.panelBg.toLowerCase()).not.toBe("#ffffff");
    expect(dark.panelBg.toLowerCase()).not.toBe(dark.panelText.toLowerCase());
    expect(light.panelBg.toLowerCase()).not.toBe(light.panelText.toLowerCase());

    const { rerender } = render(
      <AnimatedToggle
        checked
        onChange={() => {}}
        surface={dark}
        aria-label="Dark switch"
      />,
    );
    const darkSwitch = screen.getByRole("switch", { name: "Dark switch" });
    const darkThumb = darkSwitch.querySelector("span");
    expect(darkSwitch.style.backgroundColor).toBe(hexToRgb(dark.panelText));
    expect(darkThumb).not.toBeNull();
    expect(darkThumb!.style.backgroundColor).toBe(hexToRgb(dark.panelBg));

    rerender(
      <AnimatedToggle
        checked
        onChange={() => {}}
        surface={light}
        aria-label="Light switch"
      />,
    );
    const lightSwitch = screen.getByRole("switch", { name: "Light switch" });
    const lightThumb = lightSwitch.querySelector("span");
    expect(lightSwitch.style.backgroundColor).toBe(hexToRgb(light.panelText));
    expect(lightThumb).not.toBeNull();
    expect(lightThumb!.style.backgroundColor).toBe(hexToRgb(light.panelBg));
  });
});
