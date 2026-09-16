import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  KEY_REPEAT_INITIAL_DELAY_MS,
  KEY_REPEAT_INTERVAL_MS,
} from "../lib/keyRepeat";

export interface UseKeyRepeatOptions {
  enabled?: boolean;
  onFire: () => void;
  onStop?: () => void;
}

export interface KeyRepeatPointerHandlers {
  onPointerDown?: (event?: ReactPointerEvent) => void;
  onPointerUp?: (event?: ReactPointerEvent) => void;
  onPointerLeave?: (event?: ReactPointerEvent) => void;
  onPointerCancel?: (event?: ReactPointerEvent) => void;
}

export function useKeyRepeat({
  enabled = false,
  onFire,
  onStop,
}: UseKeyRepeatOptions): {
  pointerHandlers: KeyRepeatPointerHandlers;
} {
  const onFireRef = useRef(onFire);
  const onStopRef = useRef(onStop);
  const delayIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdingRef = useRef(false);

  useEffect(() => {
    onFireRef.current = onFire;
    onStopRef.current = onStop;
  });

  const clearTimers = useCallback(() => {
    if (delayIdRef.current !== null) {
      clearTimeout(delayIdRef.current);
      delayIdRef.current = null;
    }
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    clearTimers();
    onStopRef.current?.();
  }, [clearTimers]);

  const start = useCallback(() => {
    if (!enabled) return;
    clearTimers();
    holdingRef.current = true;
    onFireRef.current();
    delayIdRef.current = setTimeout(() => {
      delayIdRef.current = null;
      onFireRef.current();
      intervalIdRef.current = setInterval(() => {
        onFireRef.current();
      }, KEY_REPEAT_INTERVAL_MS);
    }, KEY_REPEAT_INITIAL_DELAY_MS);
  }, [enabled, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!enabled) {
    return { pointerHandlers: {} };
  }

  return {
    pointerHandlers: {
      onPointerDown: () => start(),
      onPointerUp: () => stop(),
      onPointerLeave: () => stop(),
      onPointerCancel: () => stop(),
    },
  };
}
