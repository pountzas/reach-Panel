import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { transparentOutlineStyle } from "../../lib/miniMode";
import {
  useKeyRepeat,
  type KeyRepeatFireMeta,
} from "../../hooks/useKeyRepeat";
import { usePressableButton } from "../../hooks/usePressableButton";
import type { TransparentKeyColor } from "../../lib/types";

type KeyButtonProps = {
  label: ReactNode;
  width?: number;
  size: number;
  spacing: number;
  fontSize: number;
  bgColor: string;
  textColor?: string;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  stretch?: boolean;
  gridColumn?: string;
  gridRow?: string;
  /** Mini-mode transparent outlined key styling. */
  transparent?: boolean;
  outlineColor?: TransparentKeyColor | string | null;
  /** Pin label to the bottom edge of the key (e.g. wide Space bar). */
  labelAlign?: "center" | "bottom";
  /**
   * When true, fire onPress on pointerdown and then on key-repeat timers
   * instead of relying on click (which would double-fire after pointerup).
   */
  repeatOnHold?: boolean;
  /** Called when a press-and-hold repeat ends (pointer up / leave / cancel). */
  onHoldEnd?: () => void;
  onPress: (meta?: KeyRepeatFireMeta) => void;
};

export function KeyButton({
  label,
  width = 1,
  size,
  spacing,
  fontSize,
  bgColor,
  textColor = "#1e293b",
  active,
  disabled = false,
  ariaLabel,
  stretch,
  gridColumn,
  gridRow,
  transparent = false,
  outlineColor,
  labelAlign = "center",
  repeatOnHold = false,
  onHoldEnd,
  onPress,
}: KeyButtonProps) {
  /** Suppress only the compatibility click for this pointer gesture. */
  const suppressClickForPointerIdRef = useRef<number | null>(null);
  const { pressedClass, pointerHandlers: pressableHandlers } = usePressableButton(
    active ?? false,
  );
  const { pointerHandlers: repeatHandlers } = useKeyRepeat({
    enabled: repeatOnHold && !disabled,
    onFire: onPress,
    onStop: onHoldEnd,
  });

  // Aborted holds (disable mid-hold) must not block a later keyboard click.
  useEffect(() => {
    if (disabled || !repeatOnHold) {
      suppressClickForPointerIdRef.current = null;
    }
  }, [disabled, repeatOnHold]);

  const clearClickSuppress = () => {
    suppressClickForPointerIdRef.current = null;
  };

  const pointerHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (repeatOnHold) {
        suppressClickForPointerIdRef.current = event.pointerId;
      }
      pressableHandlers.onPointerDown();
      repeatHandlers.onPointerDown?.(event);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerUp();
      repeatHandlers.onPointerUp?.(event);
      // Keep suppress until the compatibility click for this pointer arrives.
      void event;
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerLeave();
      repeatHandlers.onPointerLeave?.(event);
      clearClickSuppress();
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerLeave();
      repeatHandlers.onPointerCancel?.(event);
      clearClickSuppress();
    },
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
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
        clearClickSuppress();
        return;
      }
      clearClickSuppress();
      onPress({ repeat: false });
      onHoldEnd?.();
      return;
    }
    onPress();
  };

  const inGrid = gridColumn !== undefined && gridRow !== undefined;
  const alignBottom = labelAlign === "bottom";

  const sharedStyle = transparent
    ? {
      ...transparentOutlineStyle({
        active,
        outlineColor,
        color: textColor,
      }),
      fontSize,
    }
    : {
      fontSize,
      color: textColor,
      backgroundColor: bgColor,
    };

  const buttonClass = transparent
    ? `ak-action-btn inline-flex ${alignBottom ? "items-end pb-1" : "items-center"} justify-center rounded-lg font-semibold transition active:scale-95 ${pressedClass}`
    : `ak-action-btn inline-flex ${alignBottom ? "items-end pb-1" : "items-center"} justify-center ${PRESSABLE_BUTTON_CLASS} ${active ? "sticky-active" : ""} ${pressedClass}`;

  return (
    <button
      type="button"
      className={buttonClass}
      style={
        inGrid
          ? {
            ...sharedStyle,
            gridColumn,
            gridRow,
            minWidth: 0,
            minHeight: 0,
            alignSelf: "stretch",
            justifySelf: "stretch",
          }
          : stretch
            ? {
              ...sharedStyle,
              flex: `${width} 1 0`,
              minWidth: 0,
              height: size,
              marginRight: spacing,
              marginBottom: spacing,
            }
            : {
              ...sharedStyle,
              width: size * width + spacing * (width - 1),
              height: size,
              marginRight: spacing,
              marginBottom: spacing,
            }
      }
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      {...pointerHandlers}
    >
      {label}
    </button>
  );
}
