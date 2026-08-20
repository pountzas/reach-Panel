import type { ReactNode } from "react";
import { IconActionButton, type IconActionButtonSize } from "./IconActionButton";
import { useAppStore } from "../../stores/appStore";

export type HeaderIconToggleOption<T extends string = string> = {
  id: T;
  label: string;
  icon: (iconClass: string) => ReactNode;
};

/**
 * Exclusive icon toggle group for section headers (keyboard view, teaching lesson, …).
 * Selected option uses a light gray icon so the active choice is easy to see.
 */
export function HeaderIconToggleGroup<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: HeaderIconToggleOption<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const largeHeaders = useAppStore((s) => s.settings.largeHeaders);
  const iconSize: IconActionButtonSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-3.5 w-3.5";

  return (
    <div className={`section-no-drag flex shrink-0 items-center gap-0.5 ${className}`.trim()}>
      {options.map((option) => (
        <IconActionButton
          key={option.id}
          label={option.label}
          onClick={() => onChange(option.id)}
          pressed={value === option.id}
          size={iconSize}
          tooltipPlacement="below"
        >
          {option.icon(iconClass)}
        </IconActionButton>
      ))}
    </div>
  );
}
