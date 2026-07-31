export type HoverTooltipPlacement = "above" | "below";

interface HoverTooltipProps {
  label: string;
  /** Default `above`. Use `below` for top-chrome controls so labels are not clipped. */
  placement?: HoverTooltipPlacement;
}

/** Label shown on hover — use on mode toggles and icon actions. */
export function HoverTooltip({
  label,
  placement = "above",
}: HoverTooltipProps) {
  const positionClass =
    placement === "below"
      ? "top-full mt-1"
      : "bottom-full mb-1";

  return (
    <span
      className={`ak-hover-tooltip pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 ${positionClass}`}
    >
      {label}
    </span>
  );
}
