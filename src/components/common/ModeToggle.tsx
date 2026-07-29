import type { ReactNode } from "react";
import {
  MODE_TOGGLE_BUTTON_CLASS,
  modeToggleActiveClass,
  modeToggleRadiusClass,
  type ModeTogglePosition,
} from "../../lib/buttonClasses";

interface HoverTooltipProps {
  label: string;
}

/** Label shown above a control on hover — use on mode toggles and icon actions. */
export function HoverTooltip({ label }: HoverTooltipProps) {
  return (
    <span className="ak-hover-tooltip pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

interface ModeToggleButtonProps {
  active: boolean;
  position: ModeTogglePosition;
  label: string;
  onClick: () => void;
  children: ReactNode;
  activeClassName?: string;
  disabled?: boolean;
}

export function ModeToggleButton({
  active,
  position,
  label,
  onClick,
  children,
  activeClassName,
  disabled = false,
}: ModeToggleButtonProps) {
  return (
    <button
      type="button"
      className={`ak-mode-toggle ${MODE_TOGGLE_BUTTON_CLASS} ${modeToggleRadiusClass(position)} ${activeClassName ?? modeToggleActiveClass(active)} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
    >
      {children}
      <HoverTooltip label={label} />
    </button>
  );
}

interface ModeToggleGroupProps {
  children: ReactNode;
}

export function ModeToggleGroup({ children }: ModeToggleGroupProps) {
  return (
    <div className="relative box-border flex h-8 shrink-0 items-stretch overflow-visible rounded border border-slate-300">
      {children}
    </div>
  );
}
