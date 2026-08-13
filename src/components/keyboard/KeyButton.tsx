import { type ReactNode } from "react";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { transparentOutlineStyle } from "../../lib/miniMode";
import { usePressableButton } from "../../hooks/usePressableButton";
import type { TransparentKeyColor } from "../../lib/types";

interface KeyButtonProps {
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
  onPress: () => void;
}

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
  onPress,
}: KeyButtonProps) {
  const { pressedClass, pointerHandlers } = usePressableButton(active ?? false);
  const inGrid = gridColumn !== undefined && gridRow !== undefined;

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
    ? `ak-action-btn inline-flex items-center justify-center rounded-lg font-semibold transition active:scale-95 ${pressedClass}`
    : `ak-action-btn inline-flex items-center justify-center ${PRESSABLE_BUTTON_CLASS} ${active ? "sticky-active" : ""} ${pressedClass}`;

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
      onClick={onPress}
      {...pointerHandlers}
    >
      {label}
    </button>
  );
}
