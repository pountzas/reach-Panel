import { describe, expect, it, vi } from "vitest";
import * as pdfAnnotations from "./pdfAnnotations";
import {
  addStrokeToPage,
  emptyPdfAnnotationDoc,
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

/** Pre-#277 pen move: full JSON clone of the doc on every move. */
function oldPathGestureCloneCount(basePoints: number, moveCount: number): number {
  let doc = makeDocWithPoints(basePoints);
  const id = "live";
  let clones = 0;
  for (let i = 0; i < moveCount; i += 1) {
    const next = pdfAnnotations.clonePdfAnnotationDoc(doc);
    clones += 1;
    const page = pdfAnnotations.ensurePage(next, "1");
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
  return clones;
}

/** Post-#277: append in a local array; one structural commit at gesture end. */
function newPathGestureCloneCount(basePoints: number, moveCount: number): number {
  const cloneSpy = vi.spyOn(pdfAnnotations, "clonePdfAnnotationDoc");
  const doc = makeDocWithPoints(basePoints);
  const points: PdfPoint[] = [[0, 0]];
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
  const calls = cloneSpy.mock.calls.length;
  cloneSpy.mockRestore();
  return calls;
}

describe("ink gesture copy cost (~50k points on page)", () => {
  it("new path clones the doc 0 times during a gesture; old path clones once per move", () => {
    const basePoints = 50_000;
    const moveCount = 24;
    const oldClones = oldPathGestureCloneCount(basePoints, moveCount);
    const newClones = newPathGestureCloneCount(basePoints, moveCount);
    expect(oldClones).toBe(moveCount);
    expect(newClones).toBe(0);
  });
});
