import { memo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  addStrokeToPage,
  addTextToPage,
  eraseStrokesWithBrush,
  moveTextOnPage,
  replacePageStrokes,
  type PdfPoint,
  type PdfStroke,
  type PdfTextBox,
} from "../../lib/teaching";
import { useAppStore } from "../../stores/appStore";

const PEN_COLOR = "#000000";
const PEN_WIDTH = 0.002;
const ERASER_RADIUS = 0.018;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_MOVE = 0.015;

type Props = {
  page: number;
  width: number;
  height: number;
};

function pageKey(page: number): string {
  return String(page);
}

function clientToNormalized(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): PdfPoint {
  const rect = el.getBoundingClientRect();
  const x = (clientX - rect.left) / Math.max(rect.width, 1);
  const y = (clientY - rect.top) / Math.max(rect.height, 1);
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}

function pointsAttr(
  points: readonly PdfPoint[],
  width: number,
  height: number,
): string {
  let out = "";
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (i > 0) out += " ";
    out += `${p[0] * width},${p[1] * height}`;
  }
  return out;
}

function cursorForTool(
  tool: "pointer" | "pen" | "eraser" | "text",
): string {
  switch (tool) {
    case "pointer":
      return "default";
    case "pen":
      return "crosshair";
    case "eraser":
      return "cell";
    case "text":
      return "text";
    default: {
      const _exhaustive: never = tool;
      return _exhaustive;
    }
  }
}

const FinishedStrokePolyline = memo(function FinishedStrokePolyline({
  stroke,
  width,
  height,
}: {
  stroke: PdfStroke;
  width: number;
  height: number;
}) {
  if (stroke.points.length < 2) return null;
  return (
    <polyline
      points={pointsAttr(stroke.points, width, height)}
      fill="none"
      stroke={stroke.color || PEN_COLOR}
      strokeWidth={Math.max(
        1.5,
        (stroke.width || PEN_WIDTH) * Math.min(width, height),
      )}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});

/** Ink / text overlay sized to the rendered PDF page canvas. */
export function FreeWritePdfAnnotationOverlay({ page, width, height }: Props) {
  const tool = useAppStore((s) => s.freeWritePdfTool);
  const doc = useAppStore((s) => s.freeWriteAnnotationDoc);
  const selectedTextId = useAppStore((s) => s.freeWriteSelectedTextId);
  const applyUpdater = useAppStore((s) => s.applyFreeWriteAnnotationUpdater);
  const setSelectedTextId = useAppStore((s) => s.setFreeWriteSelectedTextId);
  const beginTextEdit = useAppStore((s) => s.beginFreeWritePdfTextEdit);
  const setFreeWriteFocus = useAppStore((s) => s.setFreeWriteFocus);

  const drawingRef = useRef<{ id: string; points: PdfPoint[] } | null>(null);
  const livePolylineRef = useRef<SVGPolylineElement | null>(null);
  const eraserBeforeRef = useRef<PdfStroke[] | null>(null);
  const eraserLiveRef = useRef<PdfStroke[] | null>(null);
  const eraserRafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    id: string;
    start: PdfPoint;
    origin: { x: number; y: number };
  } | null>(null);
  const lastTapRef = useRef<{
    id: string;
    at: number;
    point: PdfPoint;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [liveStroke, setLiveStroke] = useState<PdfStroke | null>(null);
  const [eraserPreview, setEraserPreview] = useState<PdfStroke[] | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const dragPreviewRef = useRef<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const pageAnn = doc.pages[pageKey(page)] ?? { strokes: [], texts: [] };
  const displayStrokes = eraserPreview ?? pageAnn.strokes;

  const flushEraserFrame = () => {
    eraserRafRef.current = null;
    const live = eraserLiveRef.current;
    if (!live) return;
    applyUpdater((d) => replacePageStrokes(d, pageKey(page), live), {
      pushUndo: false,
    });
  };

  const scheduleEraserCommit = () => {
    if (eraserRafRef.current != null) return;
    eraserRafRef.current = requestAnimationFrame(flushEraserFrame);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-pdf-text-box]")) return;

    root.setPointerCapture(e.pointerId);
    const pt = clientToNormalized(root, e.clientX, e.clientY);

    switch (tool) {
      case "pointer": {
        setSelectedTextId(null);
        return;
      }
      case "pen": {
        setFreeWriteFocus("pdf");
        const id = crypto.randomUUID();
        const points: PdfPoint[] = [pt];
        drawingRef.current = { id, points };
        const stroke: PdfStroke = {
          id,
          color: PEN_COLOR,
          width: PEN_WIDTH,
          points,
        };
        setLiveStroke(stroke);
        return;
      }
      case "eraser": {
        setFreeWriteFocus("pdf");
        const before = pageAnn.strokes;
        eraserBeforeRef.current = before;
        const next = eraseStrokesWithBrush(before, pt, ERASER_RADIUS);
        eraserLiveRef.current = next;
        setEraserPreview(next);
        scheduleEraserCommit();
        return;
      }
      case "text": {
        setFreeWriteFocus("pdfText");
        const id = crypto.randomUUID();
        const box: PdfTextBox = {
          id,
          x: Math.min(pt[0], 0.95),
          y: Math.min(pt[1], 0.95),
          w: 0.35,
          body: "",
        };
        applyUpdater((d) => addTextToPage(d, pageKey(page), box), {
          change: { kind: "addText", pageKey: pageKey(page), box },
        });
        beginTextEdit(id);
        return;
      }
      default: {
        const _exhaustive: never = tool;
        return _exhaustive;
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !root.hasPointerCapture(e.pointerId)) return;
    const pt = clientToNormalized(root, e.clientX, e.clientY);

    if (tool === "pen" && drawingRef.current) {
      drawingRef.current.points.push(pt);
      const el = livePolylineRef.current;
      if (el) {
        el.setAttribute(
          "points",
          pointsAttr(drawingRef.current.points, width, height),
        );
      }
      return;
    }

    if (tool === "eraser" && eraserBeforeRef.current && eraserLiveRef.current) {
      const next = eraseStrokesWithBrush(
        eraserLiveRef.current,
        pt,
        ERASER_RADIUS,
      );
      eraserLiveRef.current = next;
      setEraserPreview(next);
      scheduleEraserCommit();
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (root?.hasPointerCapture(e.pointerId)) {
      root.releasePointerCapture(e.pointerId);
    }

    if (tool === "pen" && drawingRef.current) {
      const finished = drawingRef.current;
      drawingRef.current = null;
      setLiveStroke(null);
      if (finished.points.length < 2) {
        return;
      }
      const stroke: PdfStroke = {
        id: finished.id,
        color: PEN_COLOR,
        width: PEN_WIDTH,
        points: finished.points.slice(),
      };
      applyUpdater((d) => addStrokeToPage(d, pageKey(page), stroke), {
        change: { kind: "addStroke", pageKey: pageKey(page), stroke },
      });
      return;
    }

    if (tool === "eraser" && eraserBeforeRef.current) {
      if (eraserRafRef.current != null) {
        cancelAnimationFrame(eraserRafRef.current);
        eraserRafRef.current = null;
      }
      const before = eraserBeforeRef.current;
      const after = eraserLiveRef.current ?? before;
      eraserBeforeRef.current = null;
      eraserLiveRef.current = null;
      setEraserPreview(null);
      const changed =
        before.length !== after.length ||
        before.some(
          (s, i) =>
            !after[i] ||
            s.id !== after[i]!.id ||
            s.points.length !== after[i]!.points.length,
        );
      if (!changed) return;
      applyUpdater((d) => replacePageStrokes(d, pageKey(page), after), {
        change: {
          kind: "replaceStrokes",
          pageKey: pageKey(page),
          before,
          after,
        },
      });
    }
  };

  const startTextDrag = (e: ReactPointerEvent, box: PdfTextBox) => {
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const start = clientToNormalized(root, e.clientX, e.clientY);
    dragRef.current = {
      id: box.id,
      start,
      origin: { x: box.x, y: box.y },
    };
    const preview = { id: box.id, x: box.x, y: box.y };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
    if (tool === "text") {
      beginTextEdit(box.id);
    } else {
      setSelectedTextId(box.id);
    }
  };

  const moveTextDrag = (e: ReactPointerEvent, boxId: string) => {
    const root = rootRef.current;
    const drag = dragRef.current;
    if (!root || !drag || drag.id !== boxId) return;
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const pt = clientToNormalized(root, e.clientX, e.clientY);
    const dx = pt[0] - drag.start[0];
    const dy = pt[1] - drag.start[1];
    const preview = {
      id: boxId,
      x: Math.min(1, Math.max(0, drag.origin.x + dx)),
      y: Math.min(1, Math.max(0, drag.origin.y + dy)),
    };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  };

  const endTextDrag = (e: ReactPointerEvent, boxId: string) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const drag = dragRef.current;
    const preview = dragPreviewRef.current;
    dragRef.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
    if (!drag || drag.id !== boxId) return;

    const nextX = preview?.id === boxId ? preview.x : drag.origin.x;
    const nextY = preview?.id === boxId ? preview.y : drag.origin.y;
    const moved =
      Math.abs(drag.origin.x - nextX) > 0.0005 ||
      Math.abs(drag.origin.y - nextY) > 0.0005;
    if (moved) {
      applyUpdater(
        (d) => moveTextOnPage(d, pageKey(page), boxId, { x: nextX, y: nextY }),
        {
          change: {
            kind: "moveText",
            pageKey: pageKey(page),
            id: boxId,
            from: { x: drag.origin.x, y: drag.origin.y },
            to: { x: nextX, y: nextY },
          },
        },
      );
      lastTapRef.current = null;
      return;
    }

    if (tool !== "pointer") {
      lastTapRef.current = null;
      return;
    }

    const root = rootRef.current;
    const point = root
      ? clientToNormalized(root, e.clientX, e.clientY)
      : drag.start;
    const now = Date.now();
    const prev = lastTapRef.current;
    const isDouble =
      prev &&
      prev.id === boxId &&
      now - prev.at <= DOUBLE_TAP_MS &&
      Math.hypot(point[0] - prev.point[0], point[1] - prev.point[1]) <=
        DOUBLE_TAP_MOVE;
    if (isDouble) {
      lastTapRef.current = null;
      beginTextEdit(boxId);
      return;
    }
    lastTapRef.current = { id: boxId, at: now, point };
  };

  const cursor = cursorForTool(tool);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ cursor, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {displayStrokes.map((stroke) => (
          <FinishedStrokePolyline
            key={stroke.id}
            stroke={stroke}
            width={width}
            height={height}
          />
        ))}
        {liveStroke && liveStroke.points.length >= 1 ? (
          <polyline
            ref={livePolylineRef}
            points={pointsAttr(liveStroke.points, width, height)}
            fill="none"
            stroke={PEN_COLOR}
            strokeWidth={Math.max(
              1.5,
              PEN_WIDTH * Math.min(width, height),
            )}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>

      {pageAnn.texts.map((box) => {
        const selected = box.id === selectedTextId;
        const preview =
          dragPreview && dragPreview.id === box.id ? dragPreview : null;
        const x = preview?.x ?? box.x;
        const y = preview?.y ?? box.y;
        return (
          <div
            key={box.id}
            data-pdf-text-box
            data-teaching-input
            className="absolute box-border min-h-[1.25em] border px-1 py-0.5 text-sm leading-snug"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${box.w * 100}%`,
              color: PEN_COLOR,
              backgroundColor: selected
                ? "rgba(255,255,200,0.85)"
                : "rgba(255,255,255,0.72)",
              borderColor: selected ? "#2563eb" : "rgba(0,0,0,0.25)",
              cursor: "move",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
            onPointerDown={(ev) => startTextDrag(ev, box)}
            onPointerMove={(ev) => moveTextDrag(ev, box.id)}
            onPointerUp={(ev) => endTextDrag(ev, box.id)}
          >
            {box.body || "\u00a0"}
          </div>
        );
      })}
    </div>
  );
}
