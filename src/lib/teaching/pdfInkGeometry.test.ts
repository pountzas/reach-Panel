import { describe, expect, it } from "vitest";
import { eraseStrokesWithBrush } from "./pdfInkGeometry";
import type { PdfStroke } from "./pdfAnnotations";

describe("eraseStrokesWithBrush", () => {
  it("drops points within radius and keeps polylines with ≥2 points", () => {
    // Algorithm: drop points within radius; keep polylines ≥ 2 points.
    const strokes: PdfStroke[] = [
      {
        id: "s1",
        color: "#000000",
        width: 0.002,
        points: [
          [0.0, 0.0],
          [0.5, 0.5],
          [1.0, 1.0],
        ],
      },
    ];
    const next = eraseStrokesWithBrush(strokes, [0.5, 0.5], 0.1);
    expect(next).toHaveLength(1);
    expect(next[0].points).toEqual([
      [0.0, 0.0],
      [1.0, 1.0],
    ]);
  });

  it("removes a stroke left with fewer than 2 points", () => {
    const strokes: PdfStroke[] = [
      {
        id: "s1",
        color: "#000000",
        width: 0.002,
        points: [
          [0.0, 0.0],
          [0.05, 0.05],
        ],
      },
    ];
    const next = eraseStrokesWithBrush(strokes, [0.0, 0.0], 0.1);
    expect(next).toHaveLength(0);
  });
});
