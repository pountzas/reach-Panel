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

  it("keeps untouched stroke identity and the same array when nothing changes", () => {
    const untouched: PdfStroke = {
      id: "keep",
      color: "#000000",
      width: 0.002,
      points: [
        [0.8, 0.8],
        [0.9, 0.9],
      ],
    };
    const hit: PdfStroke = {
      id: "hit",
      color: "#000000",
      width: 0.002,
      points: [
        [0.0, 0.0],
        [0.5, 0.5],
        [1.0, 1.0],
      ],
    };
    const strokes = [untouched, hit];
    const erased = eraseStrokesWithBrush(strokes, [0.5, 0.5], 0.1);
    expect(erased).toHaveLength(2);
    expect(erased[0]).toBe(untouched);
    expect(erased[1]).not.toBe(hit);

    const miss = eraseStrokesWithBrush(strokes, [0.1, 0.9], 0.05);
    expect(miss).toBe(strokes);
  });
});
