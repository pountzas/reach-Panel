import { describe, expect, it } from "vitest";
import {
  addStrokeToPage,
  applyPdfAnnotationChange,
  createUndoStack,
  emptyPdfAnnotationDoc,
  invertPdfAnnotationChange,
  moveTextOnPage,
  parsePdfAnnotationJson,
  removeStrokesFromPage,
  serializePdfAnnotationJson,
  type PdfAnnotationChange,
  type PdfStroke,
  type PdfTextBox,
} from "./pdfAnnotations";

describe("pdfAnnotations", () => {
  it("creates an empty schemaVersion 1 doc", () => {
    const doc = emptyPdfAnnotationDoc();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.pages).toEqual({});
  });

  it("round-trips a stroke on page 1", () => {
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = {
      strokes: [
        {
          id: "s1",
          color: "#000000",
          width: 0.002,
          points: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
        },
      ],
      texts: [],
    };
    const again = parsePdfAnnotationJson(serializePdfAnnotationJson(doc));
    expect(again.pages["1"].strokes[0].id).toBe("s1");
  });

  it("rejects unsupported schemaVersion", () => {
    expect(() =>
      parsePdfAnnotationJson(JSON.stringify({ schemaVersion: 99, pages: {} })),
    ).toThrow();
  });

  it("normalizes damaged page entries to empty strokes/texts", () => {
    const doc = parsePdfAnnotationJson(
      '{"schemaVersion":1,"pages":{"1":{},"2":{"strokes":null,"texts":[null]}}}',
    );
    expect(doc.pages["1"]).toEqual({ strokes: [], texts: [] });
    expect(doc.pages["2"]).toEqual({ strokes: [], texts: [] });
  });

  it("undo stack pops last action and caps at 50", () => {
    const stack = createUndoStack(50);
    const log: number[] = [];
    for (let i = 0; i < 55; i += 1) {
      const n = i;
      stack.push({
        undo: () => log.push(n),
        redo: () => log.push(-n),
      });
    }
    expect(stack.size()).toBe(50);
    stack.undo();
    expect(log).toEqual([54]);
    stack.undo();
    expect(log).toEqual([54, 53]);
  });

  it("redo restores after undo; new push clears redo", () => {
    const stack = createUndoStack(50);
    const log: string[] = [];
    stack.push({
      undo: () => log.push("u1"),
      redo: () => log.push("r1"),
    });
    stack.push({
      undo: () => log.push("u2"),
      redo: () => log.push("r2"),
    });
    stack.undo();
    expect(log).toEqual(["u2"]);
    expect(stack.redoSize()).toBe(1);
    stack.redo();
    expect(log).toEqual(["u2", "r2"]);
    expect(stack.redoSize()).toBe(0);
    stack.undo();
    stack.push({
      undo: () => log.push("u3"),
      redo: () => log.push("r3"),
    });
    expect(stack.redoSize()).toBe(0);
  });

  it("addStrokeToPage keeps other pages and strokes by identity", () => {
    const otherPage = {
      strokes: [
        {
          id: "keep",
          color: "#000",
          width: 0.002,
          points: [
            [0, 0],
            [1, 1],
          ] as [number, number][],
        },
      ],
      texts: [] as PdfTextBox[],
    };
    const existingStroke: PdfStroke = {
      id: "s0",
      color: "#111",
      width: 0.002,
      points: [
        [0.2, 0.2],
        [0.4, 0.4],
      ],
    };
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [existingStroke], texts: [] };
    doc.pages["2"] = otherPage;

    const added: PdfStroke = {
      id: "s1",
      color: "#000",
      width: 0.002,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    };
    const next = addStrokeToPage(doc, "1", added);

    expect(next).not.toBe(doc);
    expect(next.pages["2"]).toBe(otherPage);
    expect(next.pages["1"]).not.toBe(doc.pages["1"]);
    expect(next.pages["1"].strokes[0]).toBe(existingStroke);
    expect(next.pages["1"].strokes[1]).toBe(added);
    expect(doc.pages["1"].strokes).toHaveLength(1);
  });

  it("removeStrokesFromPage keeps untouched strokes by identity", () => {
    const keep: PdfStroke = {
      id: "keep",
      color: "#000",
      width: 0.002,
      points: [
        [0, 0],
        [1, 1],
      ],
    };
    const drop: PdfStroke = {
      id: "drop",
      color: "#f00",
      width: 0.002,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    };
    const otherPage = { strokes: [keep], texts: [] as PdfTextBox[] };
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [keep, drop], texts: [] };
    doc.pages["2"] = otherPage;

    const next = removeStrokesFromPage(doc, "1", new Set(["drop"]));
    expect(next.pages["2"]).toBe(otherPage);
    expect(next.pages["1"].strokes).toEqual([keep]);
    expect(next.pages["1"].strokes[0]).toBe(keep);
  });

  it("moveTextOnPage keeps other texts and pages by identity", () => {
    const other: PdfTextBox = { id: "t0", x: 0.1, y: 0.1, w: 0.2, body: "a" };
    const moving: PdfTextBox = { id: "t1", x: 0.2, y: 0.2, w: 0.3, body: "b" };
    const otherPage = { strokes: [] as PdfStroke[], texts: [other] };
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [], texts: [other, moving] };
    doc.pages["2"] = otherPage;

    const next = moveTextOnPage(doc, "1", "t1", { x: 0.5, y: 0.6 });
    expect(next.pages["2"]).toBe(otherPage);
    expect(next.pages["1"].texts[0]).toBe(other);
    expect(next.pages["1"].texts[1]).toEqual({
      id: "t1",
      x: 0.5,
      y: 0.6,
      w: 0.3,
      body: "b",
    });
    expect(moving.x).toBe(0.2);
  });

  it("apply + invert restores strokes after erase change", () => {
    const a: PdfStroke = {
      id: "a",
      color: "#000",
      width: 0.002,
      points: [
        [0, 0],
        [1, 1],
      ],
    };
    const b: PdfStroke = {
      id: "b",
      color: "#111",
      width: 0.002,
      points: [
        [0.2, 0.2],
        [0.3, 0.3],
      ],
    };
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [a, b], texts: [] };
    const change: PdfAnnotationChange = {
      kind: "removeStrokes",
      pageKey: "1",
      strokes: [a],
    };
    const erased = applyPdfAnnotationChange(doc, change);
    expect(erased.pages["1"].strokes.map((s) => s.id)).toEqual(["b"]);
    const restored = applyPdfAnnotationChange(
      erased,
      invertPdfAnnotationChange(change),
    );
    expect(restored.pages["1"].strokes.map((s) => s.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("serialize format stays byte-compatible for a simple doc", () => {
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = {
      strokes: [
        {
          id: "s1",
          color: "#000000",
          width: 0.002,
          points: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
        },
      ],
      texts: [{ id: "t1", x: 0.1, y: 0.2, w: 0.3, body: "hi" }],
    };
    expect(serializePdfAnnotationJson(doc)).toBe(
      '{"schemaVersion":1,"pages":{"1":{"strokes":[{"id":"s1","color":"#000000","width":0.002,"points":[[0.1,0.2],[0.3,0.4]]}],"texts":[{"id":"t1","x":0.1,"y":0.2,"w":0.3,"body":"hi"}]}}}',
    );
  });
});
