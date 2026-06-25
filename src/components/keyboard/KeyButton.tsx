import { type ReactNode } from "react";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { usePressableButton } from "../../hooks/usePressableButton";

interface KeyButtonProps {
  label: ReactNode;
  width?: number;
  size: number;
  spacing: number;
  fontSize: number;
  bgColor: string;
  textColor?: string;
  active?: boolean;
  stretch?: boolean;
  gridColumn?: string;
  gridRow?: string;
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
  stretch,
  gridColumn,
  gridRow,
  onPress,
}: KeyButtonProps) {
  const { pressedClass, pointerHandlers } = usePressableButton(active ?? false);
  const inGrid = gridColumn !== undefined && gridRow !== undefined;

  const sharedStyle = {
    fontSize,
    color: textColor,
    backgroundColor: bgColor,
  };

  return (
    <button
      type="button"
      className={`ak-action-btn ${PRESSABLE_BUTTON_CLASS} ${active ? "sticky-active" : ""} ${pressedClass}`}
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
      onClick={onPress}
      {...pointerHandlers}
    >
      {label}
    </button>
  );
}
