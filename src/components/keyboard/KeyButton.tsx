import { useState } from "react";

interface KeyButtonProps {
  label: string;
  width?: number;
  size: number;
  spacing: number;
  fontSize: number;
  bgColor: string;
  textColor?: string;
  active?: boolean;
  stretch?: boolean;
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
  onPress,
}: KeyButtonProps) {
  const [localPressed, setLocalPressed] = useState(false);
  const pressed = active || localPressed;

  return (
    <button
      type="button"
      className={`rounded-lg border border-slate-300 font-semibold shadow-sm transition active:scale-95 ${active ? "sticky-active" : ""} ${pressed ? "key-pressed" : ""}`}
      style={
        stretch
          ? {
              flex: `${width} 1 0`,
              minWidth: 0,
              height: size,
              fontSize,
              color: textColor,
              backgroundColor: bgColor,
              marginRight: spacing,
              marginBottom: spacing,
            }
          : {
              width: size * width + spacing * (width - 1),
              height: size,
              fontSize,
              color: textColor,
              backgroundColor: bgColor,
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
