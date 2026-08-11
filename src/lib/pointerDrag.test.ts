// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";
import {
  __resetPointerDragActiveForTests,
  isPointerDragActive,
  usePointerDrag,
  usePointerDragActive,
} from "./pointerDrag";

function stubPointerDown(pointerId = 1) {
  const el = document.createElement("div");
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();

  const down = new PointerEvent("pointerdown", {
    pointerId,
    clientX: 10,
    clientY: 10,
    bubbles: true,
  });
  Object.defineProperty(down, "currentTarget", { value: el, configurable: true });
  Object.defineProperty(down, "preventDefault", { value: vi.fn(), configurable: true });
  return down;
}

describe("usePointerDrag", () => {
  afterEach(() => {
    __resetPointerDragActiveForTests();
  });

  it("calls onMove for window-level pointermove after pointerdown", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => usePointerDrag({ onMove }));

    const down = stubPointerDown();
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

  it("exposes pointerDragActive while a drag is in progress", () => {
    const onMove = vi.fn();
    const { result: drag } = renderHook(() => usePointerDrag({ onMove }));
    const { result: active } = renderHook(() => usePointerDragActive());

    expect(active.current).toBe(false);
    expect(isPointerDragActive()).toBe(false);

    const down = stubPointerDown();
    const up = new PointerEvent("pointerup", { pointerId: 1, bubbles: true });

    act(() => {
      drag.current.onPointerDown(down as unknown as React.PointerEvent);
    });
    expect(active.current).toBe(true);
    expect(isPointerDragActive()).toBe(true);

    act(() => {
      window.dispatchEvent(up);
    });
    expect(active.current).toBe(false);
    expect(isPointerDragActive()).toBe(false);
  });
});
