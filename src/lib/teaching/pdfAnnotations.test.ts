import { describe, expect, it } from "vitest";
import {
  createUndoStack,
  emptyPdfAnnotationDoc,
  parsePdfAnnotationJson,
  serializePdfAnnotationJson,
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
});
