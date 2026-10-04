import type { MouseEvent as ReactMouseEvent } from "react";
import type { KeyRepeatFireMeta } from "../../hooks/useKeyRepeat";

export const handleClick = (
  event: ReactMouseEvent<HTMLButtonElement>,
  repeatOnHold: boolean,
  onPress: (meta?: KeyRepeatFireMeta) => void,
  onHoldEnd?: () => void,
): void => {
  if (repeatOnHold) {
    // Pointer taps already fired on pointerdown (and hold-repeat). A following
    // compatibility click must not fire again — touch often sends both, and
    // the click may use a different pointerId than pointerdown.
    // Keyboard/programmatic clicks use detail === 0 and must still fire.
    if (event.detail > 0) {
      return;
    }
    onPress({ repeat: false });
    onHoldEnd?.();
    return;
  }
  onPress();
};
