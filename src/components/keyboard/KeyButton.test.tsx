// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { KeyButton } from "./KeyButton";

const keyProps = {
  label: "⌫",
  size: 40,
  spacing: 4,
  fontSize: 16,
  bgColor: "#ffffff",
  ariaLabel: "Backspace",
  repeatOnHold: true,
};

describe("KeyButton repeatOnHold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onPress once for a touch tap even if a compatibility click follows", () => {
    const onPress = vi.fn();
    const { getByRole } = render(<KeyButton {...keyProps} onPress={onPress} />);
    const button = getByRole("button", { name: "Backspace" });

    fireEvent.pointerDown(button, {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    fireEvent.pointerUp(button, {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
    });
    // Touch pointers leave the hit target on lift, before the compat click.
    fireEvent.pointerLeave(button, {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      buttons: 0,
    });
    fireEvent.click(button, {
      pointerId: 1,
      pointerType: "mouse",
      detail: 1,
      button: 0,
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith({ repeat: false });
  });

  it("still fires onPress for a keyboard activation", () => {
    const onPress = vi.fn();
    const onHoldEnd = vi.fn();
    const { getByRole } = render(
      <KeyButton {...keyProps} onPress={onPress} onHoldEnd={onHoldEnd} />,
    );
    const button = getByRole("button", { name: "Backspace" });

    fireEvent.click(button, { detail: 0 });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith({ repeat: false });
    expect(onHoldEnd).toHaveBeenCalledTimes(1);
  });
});
