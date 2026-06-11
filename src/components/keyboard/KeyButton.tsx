import { useState } from "react";

interface KeyButtonProps {
  label: string;
  width?: number;
  size: number;
  spacing: number;
  fontSize: number;
  bgColor: string;
  active?: boolean;
  onPress: () => void;
}

export function KeyButton({
  label,
  width = 1,
  size,
  spacing,
  fontSize,
  bgColor,
  active,
  onPress,
}: KeyButtonProps) {
  const [localPressed, setLocalPressed] = useState(false);
  const pressed = active || localPressed;

  return (
    <button
      type="button"
      className={`rounded-lg border border-slate-300 font-semibold text-slate-800 shadow-sm transition active:scale-95 ${active ? "sticky-active" : ""} ${pressed ? "key-pressed" : ""}`}
      style={{
        width: size * width + spacing * (width - 1),
        height: size,
        fontSize,
        backgroundColor: bgColor,
        marginRight: spacing,
        marginBottom: spacing,
      }}
      onPointerDown={() => setLocalPressed(true)}
      onPointerUp={() => setLocalPressed(false)}
      onPointerLeave={() => setLocalPressed(false)}
      onClick={onPress}
    >
      {label}
    </button>
  );
}
