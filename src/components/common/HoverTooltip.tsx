export type HoverTooltipPlacement = "above" | "below";
export type HoverTooltipAlign = "center" | "start" | "end";

interface HoverTooltipProps {
  label: string;
  /** Default `above`. Use `below` for top-chrome controls so labels are not clipped. */
  placement?: HoverTooltipPlacement;
  /** Default `center`. Use `end` for right-edge controls, `start` for left-edge. */
  align?: HoverTooltipAlign;
}

function alignClass(align: HoverTooltipAlign): string {
  switch (align) {
    case "start":
      return "left-0";
    case "end":
      return "right-0";
    case "center":
      return "left-1/2 -translate-x-1/2";
    default: {
      const _exhaustive: never = align;
      return _exhaustive;
    }
  }
}

/** Label shown on hover — use on mode toggles and icon actions. */
export function HoverTooltip({
  label,
  placement = "above",
  align = "center",
}: HoverTooltipProps) {
  const positionClass =
    placement === "below"
      ? "top-full mt-1"
      : "bottom-full mb-1";

  return (
    <span
      className={`ak-hover-tooltip pointer-events-none absolute z-50 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 ${positionClass} ${alignClass(align)}`}
    >
      {label}
    </span>
  );
}
