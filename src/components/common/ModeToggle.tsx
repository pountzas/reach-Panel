import type { CSSProperties, ReactNode } from "react";
import {
  MODE_TOGGLE_BUTTON_CLASS,
  modeToggleActiveClass,
  modeToggleRadiusClass,
  type ModeTogglePosition,
} from "../../lib/buttonClasses";
import { HoverTooltip } from "./HoverTooltip";

interface ModeToggleButtonProps {
  active: boolean;
  position: ModeTogglePosition;
  label: string;
  onClick: () => void;
  children: ReactNode;
  activeClassName?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function ModeToggleButton({
  active,
  position,
  label,
  onClick,
  children,
  activeClassName,
  disabled = false,
  style,
}: ModeToggleButtonProps) {
  return (
    <button
      type="button"
      className={`ak-mode-toggle ${MODE_TOGGLE_BUTTON_CLASS} ${modeToggleRadiusClass(position)} ${activeClassName ?? modeToggleActiveClass(active)} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      style={style}
    >
      {children}
      <HoverTooltip label={label} />
    </button>
  );
}

interface ModeToggleGroupProps {
  children: ReactNode;
  transparentUi?: boolean;
  /** Outer frame color when transparentUi is on (defaults to white). */
  transparentBorderColor?: string;
}

export function ModeToggleGroup({
  children,
  transparentUi = false,
  transparentBorderColor,
}: ModeToggleGroupProps) {
  return (
    <div
      className={`relative box-border flex h-8 shrink-0 items-stretch overflow-visible rounded border ${transparentUi ? "" : "border-slate-300"}`}
      style={
        transparentUi
          ? { borderColor: transparentBorderColor ?? "rgba(255,255,255,0.8)" }
          : undefined
      }
    >
      {children}
    </div>
  );
}
