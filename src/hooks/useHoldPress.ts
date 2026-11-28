import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type UseHoldPressOptions = {
  enabled?: boolean;
  onPress: () => void;
  onRelease?: () => void;
};

export type HoldPressPointerHandlers = {
  onPointerDown?: (event: ReactPointerEvent) => void;
  onPointerUp?: (event?: ReactPointerEvent) => void;
  onPointerLeave?: (event?: ReactPointerEvent) => void;
  onPointerCancel?: (event?: ReactPointerEvent) => void;
};

/** Single fire on pointer down; onRelease on up, leave, or cancel (no key repeat). */
export const useHoldPress = ({
  enabled = false,
  onPress,
  onRelease,
}: UseHoldPressOptions): { pointerHandlers: HoldPressPointerHandlers } => {
  const onPressRef = useRef(onPress);
  const onReleaseRef = useRef(onRelease);
  const enabledRef = useRef(enabled);
  const holdingRef = useRef(false);

  useEffect((): void => {
    onPressRef.current = onPress;
    onReleaseRef.current = onRelease;
    enabledRef.current = enabled;
  });

  const stop = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    onReleaseRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
    }
  }, [enabled, stop]);

  const start = useCallback(() => {
    if (!enabledRef.current || holdingRef.current) return;
    holdingRef.current = true;
    onPressRef.current();
  }, []);

  return {
    pointerHandlers: {
      onPointerDown: () => {
        start();
      },
      onPointerUp: () => {
        stop();
      },
      onPointerLeave: () => {
        stop();
      },
      onPointerCancel: () => {
        stop();
      },
    },
  };
};
