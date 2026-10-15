import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  clonePdfAnnotationDoc,
  eraseStrokesWithBrush,
  ensurePage,
  type PdfAnnotationDoc,
  type PdfPoint,
  type PdfTextBox,
} from "../../lib/teaching";
import { useAppStore } from "../../stores/appStore";

const PEN_COLOR = "#000000";
const PEN_WIDTH = 0.002;
const ERASER_RADIUS = 0.018;

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

/** Ink / text overlay sized to the rendered PDF page canvas. */
export function FreeWritePdfAnnotationOverlay({ page, width, height }: Props) {
  const tool = useAppStore((s) => s.freeWritePdfTool);
  const doc = useAppStore((s) => s.freeWriteAnnotationDoc);
  const selectedTextId = useAppStore((s) => s.freeWriteSelectedTextId);
  const applyUpdater = useAppStore((s) => s.applyFreeWriteAnnotationUpdater);
  const setSelectedTextId = useAppStore((s) => s.setFreeWriteSelectedTextId);
  const setFreeWriteFocus = useAppStore((s) => s.setFreeWriteFocus);

  const drawingRef = useRef<{ id: string; points: PdfPoint[] } | null>(null);
  const gestureBeforeRef = useRef<PdfAnnotationDoc | null>(null);
  const dragRef = useRef<{
    id: string;
    start: PdfPoint;
    origin: { x: number; y: number };
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const pageAnn = doc.pages[pageKey(page)] ?? { strokes: [], texts: [] };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const root = rootRef.current;
    if (!root) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-pdf-text-box]")) return;

    root.setPointerCapture(e.pointerId);
    const pt = clientToNormalized(root, e.clientX, e.clientY);
    setFreeWriteFocus(tool === "text" ? "pdfText" : "pdf");

    if (tool === "pen") {
      gestureBeforeRef.current = clonePdfAnnotationDoc(doc);
      const id = crypto.randomUUID();
      drawingRef.current = { id, points: [pt] };
      applyUpdater(
        (d) => {
          const next = clonePdfAnnotationDoc(d);
          ensurePage(next, pageKey(page)).strokes.push({
            id,
            color: PEN_COLOR,
            width: PEN_WIDTH,
            points: [pt],
          });
          return next;
        },
        { pushUndo: false },
      );
      return;
    }

    if (tool === "eraser") {
      gestureBeforeRef.current = clonePdfAnnotationDoc(doc);
      applyUpdater(
        (d) => {
          const next = clonePdfAnnotationDoc(d);
          const p = ensurePage(next, pageKey(page));
          p.strokes = eraseStrokesWithBrush(p.strokes, pt, ERASER_RADIUS);
          return next;
        },
        { pushUndo: false },
      );
      return;
    }

    if (tool === "text") {
      const id = crypto.randomUUID();
      const box: PdfTextBox = {
        id,
        x: Math.min(pt[0], 0.95),
        y: Math.min(pt[1], 0.95),
        w: 0.35,
        body: "",
      };
      applyUpdater((d) => {
        const next = clonePdfAnnotationDoc(d);
        ensurePage(next, pageKey(page)).texts.push(box);
        return next;
      });
      setSelectedTextId(id);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !root.hasPointerCapture(e.pointerId)) return;
    const pt = clientToNormalized(root, e.clientX, e.clientY);

    if (tool === "pen" && drawingRef.current) {
      const { id } = drawingRef.current;
      drawingRef.current.points.push(pt);
      const points = [...drawingRef.current.points];
      applyUpdater(
        (d) => {
          const next = clonePdfAnnotationDoc(d);
          const stroke = ensurePage(next, pageKey(page)).strokes.find(
            (s) => s.id === id,
          );
          if (stroke) stroke.points = points;
          return next;
        },
        { pushUndo: false },
      );
      return;
    }

    if (tool === "eraser" && gestureBeforeRef.current) {
      applyUpdater(
        (d) => {
          const next = clonePdfAnnotationDoc(d);
          const p = ensurePage(next, pageKey(page));
          p.strokes = eraseStrokesWithBrush(p.strokes, pt, ERASER_RADIUS);
          return next;
        },
        { pushUndo: false },
      );
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
      const before = gestureBeforeRef.current;
      gestureBeforeRef.current = null;
      if (finished.points.length < 2) {
        applyUpdater(
          (d) => {
            const next = clonePdfAnnotationDoc(d);
            const p = ensurePage(next, pageKey(page));
            p.strokes = p.strokes.filter((s) => s.id !== finished.id);
            return next;
          },
          { pushUndo: false },
        );
        return;
      }
      if (before) {
        applyUpdater((d) => d, { undoFrom: before });
      }
      return;
    }

    if (tool === "eraser" && gestureBeforeRef.current) {
      const before = gestureBeforeRef.current;
      gestureBeforeRef.current = null;
      applyUpdater((d) => d, { undoFrom: before });
    }
  };

  const startTextDrag = (e: ReactPointerEvent, box: PdfTextBox) => {
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gestureBeforeRef.current = clonePdfAnnotationDoc(doc);
    const start = clientToNormalized(root, e.clientX, e.clientY);
    dragRef.current = {
      id: box.id,
      start,
      origin: { x: box.x, y: box.y },
    };
    setSelectedTextId(box.id);
  };

  const moveTextDrag = (e: ReactPointerEvent, boxId: string) => {
    const root = rootRef.current;
    const drag = dragRef.current;
    if (!root || !drag || drag.id !== boxId) return;
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const pt = clientToNormalized(root, e.clientX, e.clientY);
    const dx = pt[0] - drag.start[0];
    const dy = pt[1] - drag.start[1];
    applyUpdater(
      (d) => {
        const next = clonePdfAnnotationDoc(d);
        for (const p of Object.values(next.pages)) {
          const box = p.texts.find((t) => t.id === boxId);
          if (box) {
            box.x = Math.min(1, Math.max(0, drag.origin.x + dx));
            box.y = Math.min(1, Math.max(0, drag.origin.y + dy));
            break;
          }
        }
        return next;
      },
      { pushUndo: false },
    );
  };

  const endTextDrag = (e: ReactPointerEvent, boxId: string) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const drag = dragRef.current;
    if (!drag || drag.id !== boxId) return;
    dragRef.current = null;
    const before = gestureBeforeRef.current;
    gestureBeforeRef.current = null;
    const moved =
      Math.abs(drag.origin.x - (useAppStore.getState().freeWriteAnnotationDoc.pages[pageKey(page)]?.texts.find((t) => t.id === boxId)?.x ?? drag.origin.x)) >
        0.0005 ||
      Math.abs(drag.origin.y - (useAppStore.getState().freeWriteAnnotationDoc.pages[pageKey(page)]?.texts.find((t) => t.id === boxId)?.y ?? drag.origin.y)) >
        0.0005;
    if (moved && before) {
      applyUpdater((d) => d, { undoFrom: before });
    }
  };

  const cursor =
    tool === "pen" ? "crosshair" : tool === "eraser" ? "cell" : "text";

  return (
    <div
      ref={rootRef}
      className="absolute left-0 top-0"
      style={{ width, height, cursor, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        width={width}
        height={height}
        className="pointer-events-none absolute left-0 top-0"
        aria-hidden
      >
        {pageAnn.strokes.map((stroke) => {
          if (stroke.points.length < 2) return null;
          const points = stroke.points
            .map(([x, y]) => `${x * width},${y * height}`)
            .join(" ");
          return (
            <polyline
              key={stroke.id}
              points={points}
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
        })}
      </svg>

      {pageAnn.texts.map((box) => {
        const selected = box.id === selectedTextId;
        return (
          <div
            key={box.id}
            data-pdf-text-box
            className="absolute box-border min-h-[1.25em] border px-1 py-0.5 text-sm leading-snug"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
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
            onClick={(ev) => {
              ev.stopPropagation();
              setSelectedTextId(box.id);
            }}
          >
            {box.body || "\u00a0"}
          </div>
        );
      })}
    </div>
  );
}
