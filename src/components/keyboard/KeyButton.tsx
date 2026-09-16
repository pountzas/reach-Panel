import {
  useEffect,
  useRef,
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
import { clearClickSuppress, handleClick as handleKeyButtonClick } from "./keyButtonUtils";

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
  useEffect((): void => {
    if (disabled || !repeatOnHold) {
      suppressClickForPointerIdRef.current = null;
    }
  }, [disabled, repeatOnHold]);

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
      clearClickSuppress(suppressClickForPointerIdRef);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerLeave();
      repeatHandlers.onPointerCancel?.(event);
      clearClickSuppress(suppressClickForPointerIdRef);
    },
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
      onClick={(event) =>
        handleKeyButtonClick(
          event,
          repeatOnHold,
          suppressClickForPointerIdRef,
          onPress,
          onHoldEnd,
        )
      }
      onContextMenu={(e) => e.preventDefault()}
      {...pointerHandlers}
    >
      {label}
    </button>
  );
}
