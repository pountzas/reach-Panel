import type { ReactNode } from "react";
import {
  HoverTooltip,
  type HoverTooltipPlacement,
} from "./HoverTooltip";

export type IconActionButtonSize = "sm" | "lg";

interface IconActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  /** Default `sm` (24×24). Use `lg` for large-headers chrome (48×48). */
  size?: IconActionButtonSize;
  /** Default `above`. Use `below` for top-edge header actions. */
  tooltipPlacement?: HoverTooltipPlacement;
}

export function IconActionButton({
  label,
  onClick,
  disabled = false,
  children,
  className = "",
  size = "sm",
  tooltipPlacement = "above",
}: IconActionButtonProps) {
  const sizeClass = size === "lg" ? "h-12 w-12" : "h-6 w-6";

  return (
    <button
      type="button"
      className={`group relative flex ${sizeClass} shrink-0 items-center justify-center rounded transition-colors hover:bg-black/10 disabled:opacity-50 disabled:hover:bg-transparent ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
      <HoverTooltip label={label} placement={tooltipPlacement} />
    </button>
  );
}
