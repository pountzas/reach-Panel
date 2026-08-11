// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import { usePointerDrag } from "./pointerDrag";

describe("usePointerDrag", () => {
  it("calls onMove for window-level pointermove after pointerdown", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => usePointerDrag({ onMove }));

    const el = document.createElement("div");
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();

    const down = new PointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      bubbles: true,
    });
    Object.defineProperty(down, "currentTarget", { value: el, configurable: true });
    Object.defineProperty(down, "preventDefault", { value: vi.fn(), configurable: true });

    const move = new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 20,
      clientY: 10,
      bubbles: true,
    });
    const up = new PointerEvent("pointerup", { pointerId: 1, bubbles: true });

    act(() => {
      result.current.onPointerDown(down as unknown as React.PointerEvent);
      window.dispatchEvent(move);
      window.dispatchEvent(up);
    });

    expect(onMove).toHaveBeenCalled();
  });
});
