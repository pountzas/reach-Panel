import { describe, expect, it } from "vitest";
import {
  filterAndRemapAnnotations,
  normalizeExportPageRange,
  rangeForAllPages,
  rangeForCurrentPage,
  suggestedExportFileName,
} from "./pdfExportRange";
import { emptyPdfAnnotationDoc } from "./pdfAnnotations";

describe("normalizeExportPageRange", () => {
  it("accepts inclusive in-range bounds", () => {
    expect(
      normalizeExportPageRange({ from: 4, to: 12, pageCount: 50 }),
    ).toEqual({
      from: 4,
      to: 12,
    });
  });

  it("rejects from > to", () => {
    expect(normalizeExportPageRange({ from: 5, to: 2, pageCount: 10 })).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("rejects out of range", () => {
    expect(normalizeExportPageRange({ from: 0, to: 2, pageCount: 10 })).toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});

describe("range helpers", () => {
  it("all pages", () => {
    expect(rangeForAllPages(50)).toEqual({ from: 1, to: 50 });
  });

  it("current page", () => {
    expect(rangeForCurrentPage(7, 50)).toEqual({ from: 7, to: 7 });
  });
});

describe("filterAndRemapAnnotations", () => {
  it("remaps pages 4 and 12 into 1 and 9 when exporting 4..12", () => {
    const doc = emptyPdfAnnotationDoc();
    doc.pages["4"] = {
      strokes: [
        {
          id: "a",
          color: "#000000",
          width: 0.002,
          points: [[0.1, 0.1]],
        },
      ],
      texts: [],
    };
    doc.pages["12"] = {
      strokes: [],
      texts: [{ id: "t", x: 0.2, y: 0.3, w: 0.4, body: "hi" }],
    };
    doc.pages["3"] = {
      strokes: [
        {
          id: "skip",
          color: "#000000",
          width: 0.002,
          points: [[0, 0]],
        },
      ],
      texts: [],
    };
    const out = filterAndRemapAnnotations(doc, 4, 12);
    expect(Object.keys(out.pages).sort()).toEqual(["1", "9"]);
    expect(out.pages["1"].strokes[0].id).toBe("a");
    expect(out.pages["9"].texts[0].body).toBe("hi");
    expect(out.pages["3"]).toBeUndefined();
  });
});

describe("suggestedExportFileName", () => {
  it("uses page singular when from === to", () => {
    expect(suggestedExportFileName("C:\\Books\\ws.pdf", 7, 7)).toBe(
      "ws-page-7.reach.pdf",
    );
  });

  it("uses pages range when from !== to", () => {
    expect(suggestedExportFileName("C:\\Books\\ws.reach.pdf", 4, 12)).toBe(
      "ws-pages-4-12.reach.pdf",
    );
  });
});
