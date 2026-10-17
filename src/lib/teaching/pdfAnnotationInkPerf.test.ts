import { describe, expect, it } from "vitest";
import {
  addStrokeToPage,
  clonePdfAnnotationDoc,
  emptyPdfAnnotationDoc,
  ensurePage,
  type PdfPoint,
  type PdfStroke,
} from "./pdfAnnotations";

function makeDocWithPoints(pointCount: number) {
  const points: PdfPoint[] = [];
  for (let i = 0; i < pointCount; i += 1) {
    points.push([i / pointCount, (i % 100) / 100]);
  }
  const stroke: PdfStroke = {
    id: "heavy",
    color: "#000",
    width: 0.002,
    points,
  };
  const doc = emptyPdfAnnotationDoc();
  doc.pages["1"] = { strokes: [stroke], texts: [] };
  return doc;
}

/** Simulates pre-#277 pen move: full JSON clone of the doc on every move. */
function oldPathGestureMs(basePoints: number, moveCount: number): number {
  let doc = makeDocWithPoints(basePoints);
  const id = "live";
  const t0 = performance.now();
  for (let i = 0; i < moveCount; i += 1) {
    const next = clonePdfAnnotationDoc(doc);
    const page = ensurePage(next, "1");
    let stroke = page.strokes.find((s) => s.id === id);
    if (!stroke) {
      stroke = {
        id,
        color: "#000",
        width: 0.002,
        points: [[0, 0]],
      };
      page.strokes.push(stroke);
    }
    stroke.points = [...stroke.points, [i / moveCount, 0.5]];
    doc = next;
  }
  return performance.now() - t0;
}

/** Post-#277: append in a local array; one structural commit at gesture end. */
function newPathGestureMs(basePoints: number, moveCount: number): number {
  const doc = makeDocWithPoints(basePoints);
  const points: PdfPoint[] = [[0, 0]];
  const t0 = performance.now();
  for (let i = 0; i < moveCount; i += 1) {
    points.push([i / moveCount, 0.5]);
  }
  const stroke: PdfStroke = {
    id: "live",
    color: "#000",
    width: 0.002,
    points,
  };
  addStrokeToPage(doc, "1", stroke);
  return performance.now() - t0;
}

describe("ink gesture copy cost (~50k points on page)", () => {
  it(
    "new path is far cheaper than full-doc clone-per-move",
    () => {
      const basePoints = 50_000;
      // Fewer moves than a real stroke keeps CI under ~5s while still showing
      // clone-per-move cost on a ~50k-point page. Full 120-move run locally:
      // before≈13979ms, after≈0.3ms (2026-10-17).
      const moveCount = 24;
      const oldMs = oldPathGestureMs(basePoints, moveCount);
      const newMs = newPathGestureMs(basePoints, moveCount);
      console.log(
        `[issue-277 perf] ~${basePoints} pts page, ${moveCount} moves: before(clone/move)=${oldMs.toFixed(1)}ms after(commit-once)=${newMs.toFixed(1)}ms`,
      );
      expect(newMs).toBeLessThan(oldMs);
      expect(newMs).toBeLessThan(16);
    },
    30_000,
  );
});
