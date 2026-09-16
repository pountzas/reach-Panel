// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  KEY_REPEAT_INITIAL_DELAY_MS,
  KEY_REPEAT_INTERVAL_MS,
} from "../lib/keyRepeat";
import { useKeyRepeat } from "./useKeyRepeat";

describe("useKeyRepeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once immediately, then after initial delay, then on interval until release", () => {
    const onFire = vi.fn();
    const onStop = vi.fn();
    const { result } = renderHook(() =>
      useKeyRepeat({ enabled: true, onFire, onStop }),
    );

    act(() => {
      result.current.pointerHandlers.onPointerDown?.();
    });
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenLastCalledWith({ repeat: false });

    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_INITIAL_DELAY_MS - 1);
    });
    expect(onFire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onFire).toHaveBeenCalledTimes(2);
    expect(onFire).toHaveBeenLastCalledWith({ repeat: true });

    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_INTERVAL_MS);
    });
    expect(onFire).toHaveBeenCalledTimes(3);
    expect(onFire).toHaveBeenLastCalledWith({ repeat: true });

    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_INTERVAL_MS * 2);
    });
    expect(onFire).toHaveBeenCalledTimes(5);

    act(() => {
      result.current.pointerHandlers.onPointerUp?.();
    });
    expect(onStop).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_INTERVAL_MS * 10);
    });
    expect(onFire).toHaveBeenCalledTimes(5);
  });

  it("clears repeat on pointer leave and cancel", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() =>
      useKeyRepeat({ enabled: true, onFire }),
    );

    act(() => {
      result.current.pointerHandlers.onPointerDown?.();
      vi.advanceTimersByTime(KEY_REPEAT_INITIAL_DELAY_MS);
    });
    expect(onFire).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.pointerHandlers.onPointerLeave?.();
      vi.advanceTimersByTime(KEY_REPEAT_INTERVAL_MS * 5);
    });
    expect(onFire).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.pointerHandlers.onPointerDown?.();
      vi.advanceTimersByTime(KEY_REPEAT_INITIAL_DELAY_MS);
      result.current.pointerHandlers.onPointerCancel?.();
      vi.advanceTimersByTime(KEY_REPEAT_INTERVAL_MS * 5);
    });
    expect(onFire).toHaveBeenCalledTimes(4);
  });

  it("does nothing when disabled", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() =>
      useKeyRepeat({ enabled: false, onFire }),
    );

    act(() => {
      result.current.pointerHandlers.onPointerDown?.();
      vi.advanceTimersByTime(KEY_REPEAT_INITIAL_DELAY_MS + KEY_REPEAT_INTERVAL_MS * 5);
    });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("stops timers and calls onStop when enabled becomes false mid-hold", () => {
    const onFire = vi.fn();
    const onStop = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useKeyRepeat({ enabled, onFire, onStop }),
      { initialProps: { enabled: true } },
    );

    act(() => {
      result.current.pointerHandlers.onPointerDown?.();
      vi.advanceTimersByTime(KEY_REPEAT_INITIAL_DELAY_MS);
    });
    expect(onFire).toHaveBeenCalledTimes(2);

    act(() => {
      rerender({ enabled: false });
    });
    expect(onStop).toHaveBeenCalledTimes(1);

    const firesAtDisable = onFire.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(KEY_REPEAT_INTERVAL_MS * 10);
    });
    expect(onFire).toHaveBeenCalledTimes(firesAtDisable);
  });
});
