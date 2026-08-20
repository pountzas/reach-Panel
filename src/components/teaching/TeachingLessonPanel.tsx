import type { CSSProperties, ReactNode } from "react";
import { HoverTooltip } from "../common/HoverTooltip";
import { ResizableSplitPane } from "../layout/ResizableSplitPane";

export const DEFAULT_TEACHING_LESSON_LEFT_RATIO = 0.4;

export type TeachingLessonSurface = {
  panelBorder: string;
  panelBg: string;
  panelText: string;
  panelMutedText: string;
};

/** Outer bordered shell with a resizable left/right split for teaching lessons. */
export function TeachingLessonPanel({
  surface,
  left,
  right,
  leftRatio,
  onLeftRatioChange,
  footer,
  minLeftWidth = 120,
  minRightWidth = 140,
  maxLeftRatio = 0.72,
}: {
  surface: TeachingLessonSurface;
  left: ReactNode;
  right: ReactNode;
  leftRatio: number;
  onLeftRatioChange: (ratio: number) => void;
  /** Optional full-width strip below the split (e.g. music note strip). */
  footer?: ReactNode;
  minLeftWidth?: number;
  minRightWidth?: number;
  maxLeftRatio?: number;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border"
      style={{
        backgroundColor: surface.panelBg,
        borderColor: surface.panelBorder,
        color: surface.panelText,
      }}
    >
      <div className="min-h-0 flex-1">
        <ResizableSplitPane
          ratioSide="left"
          rightRatio={leftRatio}
          onRightRatioChange={onLeftRatioChange}
          minLeftWidth={minLeftWidth}
          minRightWidth={minRightWidth}
          maxRightRatio={maxLeftRatio}
          minSizedWindowRatio={0.2}
          splitterColor={surface.panelBorder}
          splitterLineWidth={2}
          left={left}
          right={right}
        />
      </div>
      {footer ? <div className="shrink-0 border-t p-2" style={{ borderColor: surface.panelBorder }}>{footer}</div> : null}
    </div>
  );
}

/** Scrollable (or clipped) column content for teaching left/right panes. */
export function TeachingLessonPane({
  children,
  scroll = true,
  padded = true,
  className = "",
  style,
}: {
  children: ReactNode;
  /** When true, pane scrolls vertically; when false, content is clipped (practice area). */
  scroll?: boolean;
  /** When false, omits default padding (e.g. full-bleed partiture). */
  padded?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const overflowClass = scroll
    ? "overflow-x-hidden overflow-y-auto"
    : "overflow-hidden";
  const padClass = padded ? "p-2" : "";
  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-col gap-2 ${overflowClass} ${padClass} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

/** Icon toolbar action used in teaching lesson headers (Language, Music, …). */
export function TeachingLessonToolbarButton({
  label,
  onClick,
  disabled,
  backgroundColor,
  borderColor,
  color,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  backgroundColor: string;
  borderColor: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border disabled:opacity-50"
      style={{
        borderColor,
        backgroundColor,
        color,
      }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
      <HoverTooltip label={label} placement="below" align="end" />
    </button>
  );
}
