import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  KEY_REPEAT_INITIAL_DELAY_MS,
  KEY_REPEAT_INTERVAL_MS,
} from "../lib/keyRepeat";

export type KeyRepeatFireMeta = { repeat: boolean };

export type UseKeyRepeatOptions = {
  enabled?: boolean;
  onFire: (meta: KeyRepeatFireMeta) => void;
  onStop?: () => void;
};

export type KeyRepeatPointerHandlers = {
  onPointerDown?: (event?: ReactPointerEvent) => void;
  onPointerUp?: (event?: ReactPointerEvent) => void;
  onPointerLeave?: (event?: ReactPointerEvent) => void;
  onPointerCancel?: (event?: ReactPointerEvent) => void;
};

export const useKeyRepeat = ({
  enabled = false,
  onFire,
  onStop,
}: UseKeyRepeatOptions): {
  pointerHandlers: KeyRepeatPointerHandlers;
} => {
  const onFireRef = useRef(onFire);
  const onStopRef = useRef(onStop);
  const enabledRef = useRef(enabled);
  const delayIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdingRef = useRef(false);

  useEffect(() => {
    onFireRef.current = onFire;
    onStopRef.current = onStop;
    enabledRef.current = enabled;
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
    if (!enabledRef.current) return;
    clearTimers();
    holdingRef.current = true;
    onFireRef.current({ repeat: false });
    delayIdRef.current = setTimeout(() => {
      delayIdRef.current = null;
      if (!enabledRef.current || !holdingRef.current) return;
      onFireRef.current({ repeat: true });
      intervalIdRef.current = setInterval(() => {
        if (!enabledRef.current || !holdingRef.current) return;
        onFireRef.current({ repeat: true });
      }, KEY_REPEAT_INTERVAL_MS);
    }, KEY_REPEAT_INITIAL_DELAY_MS);
  }, [clearTimers]);

  // Mid-hold disable (e.g. KeyButton disabled) must tear down timers + onStop.
  useEffect(() => {
    if (!enabled) {
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    pointerHandlers: {
      onPointerDown: () => start(),
      onPointerUp: () => stop(),
      onPointerLeave: () => stop(),
      onPointerCancel: () => stop(),
    },
  };
};
