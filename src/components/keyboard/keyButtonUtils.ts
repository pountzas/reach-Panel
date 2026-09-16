import type { MutableRefObject, MouseEvent as ReactMouseEvent } from "react";
import type { KeyRepeatFireMeta } from "../../hooks/useKeyRepeat";

export const clearClickSuppress = (
  suppressClickForPointerIdRef: MutableRefObject<number | null>,
): void => {
  suppressClickForPointerIdRef.current = null;
};

export const handleClick = (
  event: ReactMouseEvent<HTMLButtonElement>,
  repeatOnHold: boolean,
  suppressClickForPointerIdRef: MutableRefObject<number | null>,
  onPress: (meta?: KeyRepeatFireMeta) => void,
  onHoldEnd?: () => void,
): void => {
  if (repeatOnHold) {
    const suppressId = suppressClickForPointerIdRef.current;
    const native = event.nativeEvent as MouseEvent & { pointerId?: number };
    const clickPointerId =
      typeof native.pointerId === "number" ? native.pointerId : null;
    // Suppress only the compatibility click for the active hold pointer.
    // Keyboard/programmatic clicks use detail === 0 and must still fire.
    const isCompatClickForHold =
      suppressId !== null &&
      event.detail > 0 &&
      (clickPointerId === null || clickPointerId === suppressId);
    if (isCompatClickForHold) {
      clearClickSuppress(suppressClickForPointerIdRef);
      return;
    }
    clearClickSuppress(suppressClickForPointerIdRef);
    onPress({ repeat: false });
    onHoldEnd?.();
    return;
  }
  onPress();
};
