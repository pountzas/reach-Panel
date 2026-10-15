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

  it("undo stack pops last action and caps at 50", () => {
    const stack = createUndoStack(50);
    const log: number[] = [];
    for (let i = 0; i < 55; i += 1) {
      const n = i;
      stack.push({ undo: () => log.push(n) });
    }
    expect(stack.size()).toBe(50);
    stack.undo();
    expect(log).toEqual([54]);
    stack.undo();
    expect(log).toEqual([54, 53]);
  });
});
