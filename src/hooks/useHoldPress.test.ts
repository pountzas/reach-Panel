// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHoldPress } from "./useHoldPress";

describe("useHoldPress", () => {
  it("fires onPress once on pointer down", () => {
    const onPress = vi.fn();
    const { result } = renderHook(() =>
      useHoldPress({ enabled: true, onPress }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown?.({} as never);
      result.current.pointerHandlers.onPointerDown?.({} as never);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("fires onRelease on pointer up, leave, and cancel", () => {
    const onRelease = vi.fn();
    const { result } = renderHook(() =>
      useHoldPress({ enabled: true, onPress: vi.fn(), onRelease }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown?.({} as never);
    });
    act(() => {
      result.current.pointerHandlers.onPointerUp?.({} as never);
    });
    expect(onRelease).toHaveBeenCalledTimes(1);

    onRelease.mockClear();
    act(() => {
      result.current.pointerHandlers.onPointerDown?.({} as never);
      result.current.pointerHandlers.onPointerLeave?.({} as never);
    });
    expect(onRelease).toHaveBeenCalledTimes(1);

    onRelease.mockClear();
    act(() => {
      result.current.pointerHandlers.onPointerDown?.({} as never);
      result.current.pointerHandlers.onPointerCancel?.({} as never);
    });
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("releases when enabled flips false", () => {
    const onRelease = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useHoldPress({ enabled, onPress: vi.fn(), onRelease }),
      { initialProps: { enabled: true } },
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown?.({} as never);
    });
    rerender({ enabled: false });
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("releases on unmount", () => {
    const onRelease = vi.fn();
    const { result, unmount } = renderHook(() =>
      useHoldPress({ enabled: true, onPress: vi.fn(), onRelease }),
    );
    act(() => {
      result.current.pointerHandlers.onPointerDown?.({} as never);
    });
    unmount();
    expect(onRelease).toHaveBeenCalledTimes(1);
  });
});