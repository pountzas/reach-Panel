// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getSurfaceColors } from "../../lib/colorProfiles";

vi.mock("../../hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MicShortcutRecorder } from "./MicShortcutRecorder";

const surface = getSurfaceColors("#e5e7eb");

describe("MicShortcutRecorder", () => {
  it("does not save on modifier-only keydown; saves on non-modifier keydown", () => {
    const onChange = vi.fn();
    render(
      <MicShortcutRecorder value={["ctrl", "h"]} onChange={onChange} surface={surface} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "pcMicCustomRecord" }));

    fireEvent.keyDown(window, {
      key: "Control",
      code: "ControlLeft",
      ctrlKey: true,
      bubbles: true,
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, {
      key: "h",
      code: "KeyH",
      ctrlKey: true,
      bubbles: true,
    });
    expect(onChange).toHaveBeenCalledWith(["ctrl", "h"]);
  });

  it("saves modifier-only combo on keyup when all modifiers released", () => {
    const onChange = vi.fn();
    render(
      <MicShortcutRecorder value={["ralt"]} onChange={onChange} surface={surface} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "pcMicCustomRecord" }));

    fireEvent.keyDown(window, {
      key: "Alt",
      code: "AltRight",
      altKey: true,
      location: KeyboardEvent.DOM_KEY_LOCATION_RIGHT,
      bubbles: true,
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyUp(window, {
      key: "Alt",
      code: "AltRight",
      altKey: false,
      bubbles: true,
    });
    expect(onChange).toHaveBeenCalledWith(["ralt"]);
  });
});