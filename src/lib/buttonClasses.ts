/** Shared Tailwind classes for pressable panel controls (keys, trackpad actions, etc.). */
export const PRESSABLE_BUTTON_CLASS =
  "rounded-lg border border-slate-300 font-semibold shadow-sm transition active:scale-95";

/** Base classes for icon mode-toggle segments (keyboard/synth, mouse/numpad). */
export const MODE_TOGGLE_BUTTON_CLASS =
  "group relative flex items-center justify-center p-2 transition-colors";

export function modeToggleActiveClass(active: boolean) {
  return active ? "bg-slate-700 text-white" : "bg-white text-slate-700";
}

export type ModeTogglePosition = "first" | "middle" | "last" | "only";

export function modeToggleRadiusClass(position: ModeTogglePosition) {
  switch (position) {
    case "first":
      return "rounded-l";
    case "middle":
      return "rounded-none";
    case "last":
      return "rounded-r";
    case "only":
      return "rounded";
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}

export function modeToggleSegmentPosition(
  index: number,
  total: number,
): ModeTogglePosition {
  if (total <= 1) return "only";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}
