import type { ReactNode } from "react";
import { HoverTooltip } from "./ModeToggle";

interface IconActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function IconActionButton({
  label,
  onClick,
  disabled = false,
  children,
  className = "",
}: IconActionButtonProps) {
  return (
    <button
      type="button"
      className={`group relative flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/10 disabled:opacity-50 disabled:hover:bg-transparent ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
      <HoverTooltip label={label} />
    </button>
  );
}
