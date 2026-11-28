import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { transparentOutlineStyle } from "../../lib/focusMode";
import { useHoldPress } from "../../hooks/useHoldPress";
import { useKeyRepeat, type KeyRepeatFireMeta } from "../../hooks/useKeyRepeat";
import { usePressableButton } from "../../hooks/usePressableButton";
import { handleClick as handleKeyButtonClick } from "./keyButtonUtils";

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
  /** Focus-mode transparent outlined key styling. */
  transparent?: boolean;
  outlineColor?: string | null;
  /** Pin label to the bottom edge of the key (e.g. wide Space bar). */
  labelAlign?: "center" | "bottom";
  /**
   * When true, fire onPress on pointerdown and then on key-repeat timers
   * instead of relying on click (which would double-fire after pointerup).
   */
  repeatOnHold?: boolean;
  /** Single action on pointer down; release on up / cancel (hold-to-talk). */
  holdPress?: boolean;
  /** Called when a press-and-hold repeat ends (pointer up / leave / cancel). */
  onHoldEnd?: () => void;
  onPress: (meta?: KeyRepeatFireMeta) => void;
};

export const KeyButton = memo(function KeyButton({
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
  holdPress = false,
  onHoldEnd,
  onPress,
}: KeyButtonProps) {
  const { pressedClass, pointerHandlers: pressableHandlers } =
    usePressableButton(active ?? false);
  const { pointerHandlers: repeatHandlers } = useKeyRepeat({
    enabled: repeatOnHold && !holdPress && !disabled,
    onFire: onPress,
    onStop: onHoldEnd,
  });
  const { pointerHandlers: holdPressHandlers } = useHoldPress({
    enabled: holdPress && !repeatOnHold && !disabled,
    onPress: () => {
      onPress();
    },
    onRelease: onHoldEnd,
  });

  const pointerHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerDown();
      if (holdPress) {
        holdPressHandlers.onPointerDown?.(event);
      } else {
        repeatHandlers.onPointerDown?.(event);
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerUp();
      if (holdPress) {
        holdPressHandlers.onPointerUp?.(event);
      } else {
        repeatHandlers.onPointerUp?.(event);
      }
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerLeave();
      if (holdPress) {
        holdPressHandlers.onPointerLeave?.(event);
      } else {
        repeatHandlers.onPointerLeave?.(event);
      }
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      pressableHandlers.onPointerLeave();
      if (holdPress) {
        holdPressHandlers.onPointerCancel?.(event);
      } else {
        repeatHandlers.onPointerCancel?.(event);
      }
    },
  };

  const inGrid = gridColumn !== undefined && gridRow !== undefined;
  const alignBottom = labelAlign === "bottom";

  const sharedStyle = {
    ...(transparent
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
        }),
    ...(transparent && disabled ? { opacity: 0.45 } : {}),
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
      onClick={(event) => {
        handleKeyButtonClick(
          event,
          repeatOnHold || holdPress,
          onPress,
          onHoldEnd,
        );
      }}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      {...pointerHandlers}>
      {label}
    </button>
  );
});
