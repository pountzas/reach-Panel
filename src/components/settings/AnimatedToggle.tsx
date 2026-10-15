import type { JSX } from "react";
import type { SurfaceColors } from "../../lib/colorProfiles";

type AnimatedToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  surface: SurfaceColors;
  disabled?: boolean;
  id?: string;
};

export function AnimatedToggle({
  checked,
  onChange,
  surface,
  disabled = false,
  id,
}: AnimatedToggleProps): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out motion-reduce:transition-none ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
      style={{
        backgroundColor: checked ? surface.panelText : surface.insetBorder,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out motion-reduce:transition-none ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
