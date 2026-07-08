import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "../../hooks/useTranslation";

const SPLITTER_WIDTH = 6;
const DEFAULT_MIN_LEFT = 160;
const DEFAULT_MIN_RIGHT = 140;
const DEFAULT_MAX_SIZED_RATIO = 1 / 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface ResizableSplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  /** Width fraction (0–1) of the pane on `ratioSide`. */
  rightRatio: number;
  onRightRatioChange: (ratio: number) => void;
  ratioSide?: "left" | "right";
  minLeftWidth?: number;
  minRightWidth?: number;
  maxRightRatio?: number;
}

export function ResizableSplitPane({
  left,
  right,
  rightRatio,
  onRightRatioChange,
  ratioSide = "right",
  minLeftWidth = DEFAULT_MIN_LEFT,
  minRightWidth = DEFAULT_MIN_RIGHT,
  maxRightRatio = DEFAULT_MAX_SIZED_RATIO,
}: ResizableSplitPaneProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startRatio: number; width: number } | null>(
    null,
  );

  const sizedMinWidth = ratioSide === "left" ? minLeftWidth : minRightWidth;
  const otherMinWidth = ratioSide === "left" ? minRightWidth : minLeftWidth;

  const ratioBounds = useCallback(
    (totalWidth: number) => {
      const minSized = (sizedMinWidth + SPLITTER_WIDTH) / totalWidth;
      const maxFromOtherMin =
        (totalWidth - otherMinWidth - SPLITTER_WIDTH) / totalWidth;
      const maxFromWindow = (window.innerWidth * maxRightRatio) / totalWidth;
      const maxSized = Math.min(maxFromOtherMin, maxFromWindow);
      return { minSized, maxSized: Math.max(minSized, maxSized) };
    },
    [maxRightRatio, otherMinWidth, sizedMinWidth],
  );

  const clampToBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;

    const { minSized, maxSized } = ratioBounds(width);
    if (rightRatio > maxSized || rightRatio < minSized) {
      onRightRatioChange(clamp(rightRatio, minSized, maxSized));
    }
  }, [onRightRatioChange, ratioBounds, rightRatio]);

  useEffect(() => {
    clampToBounds();

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => clampToBounds());
    observer.observe(container);
    window.addEventListener("resize", clampToBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", clampToBounds);
    };
  }, [clampToBounds]);

  const onSplitterPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startRatio: rightRatio,
      width,
    };
  };

  const onSplitterPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    const rawDelta = (drag.startX - event.clientX) / drag.width;
    const deltaRatio = ratioSide === "left" ? -rawDelta : rawDelta;
    const { minSized, maxSized } = ratioBounds(drag.width);
    onRightRatioChange(clamp(drag.startRatio + deltaRatio, minSized, maxSized));
  };

  const onSplitterPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
  };

  const leftFlex = ratioSide === "left" ? rightRatio : 1 - rightRatio;
  const rightFlex = ratioSide === "left" ? 1 - rightRatio : rightRatio;
  const maxSizedPercent = Math.round(maxRightRatio * 100);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 items-stretch">
      <div
        className="min-h-0 min-w-0"
        style={{ flex: `${leftFlex} 1 0`, minWidth: minLeftWidth }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("resizeInputRow")}
        aria-valuemin={0}
        aria-valuemax={maxSizedPercent}
        aria-valuenow={Math.round(rightRatio * 100)}
        className="group z-20 flex shrink-0 cursor-col-resize items-stretch px-0.5"
        style={{ width: SPLITTER_WIDTH }}
        onPointerDown={onSplitterPointerDown}
        onPointerMove={onSplitterPointerMove}
        onPointerUp={onSplitterPointerUp}
        onPointerCancel={onSplitterPointerUp}
        onLostPointerCapture={() => {
          dragStateRef.current = null;
        }}
      >
        <div className="w-0.5 flex-1 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-500 group-active:bg-slate-600" />
      </div>
      <div
        className="min-h-0 min-w-0"
        style={{ flex: `${rightFlex} 1 0`, minWidth: minRightWidth }}
      >
        {right}
      </div>
    </div>
  );
}
