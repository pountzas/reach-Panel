import { type ReactNode, useState } from "react";

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
  const [localPressed, setLocalPressed] = useState(false);
  const pressed = active || localPressed;
  const inGrid = gridColumn !== undefined && gridRow !== undefined;

  const sharedStyle = {
    fontSize,
    color: textColor,
    backgroundColor: bgColor,
  };

  return (
    <button
      type="button"
      className={`rounded-lg border border-slate-300 font-semibold shadow-sm transition active:scale-95 ${active ? "sticky-active" : ""} ${pressed ? "key-pressed" : ""}`}
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
      onPointerDown={() => setLocalPressed(true)}
      onPointerUp={() => setLocalPressed(false)}
      onPointerLeave={() => setLocalPressed(false)}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
