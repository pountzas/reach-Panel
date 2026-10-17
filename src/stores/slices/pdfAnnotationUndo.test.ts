// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  addStrokeToPage,
  addTextToPage,
  emptyPdfAnnotationDoc,
  moveTextOnPage,
  replacePageStrokes,
  type PdfStroke,
  type PdfTextBox,
} from "../../lib/teaching";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({ label: "main" }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

vi.mock("../../lib/notify", () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { useAppStore } from "../appStore";

const stroke = (id: string, points: [number, number][]): PdfStroke => ({
  id,
  color: "#000000",
  width: 0.002,
  points,
});

describe("freeWrite annotation undo/redo (per-gesture changes)", () => {
  beforeEach(async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(() => Promise.resolve(false));
    await useAppStore.getState().loadFreeWriteAnnotations(null);
    useAppStore.setState({
      freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
      freeWriteAnnotationDirty: false,
      freeWriteUndoDepth: 0,
      freeWriteRedoDepth: 0,
    });
  });

  it("undo/redo a stroke keeps other page identity", () => {
    const otherPage = {
      strokes: [stroke("keep", [[0, 0], [1, 1]])],
      texts: [] as PdfTextBox[],
    };
    const base = emptyPdfAnnotationDoc();
    base.pages["2"] = otherPage;
    useAppStore.setState({ freeWriteAnnotationDoc: base });

    const added = stroke("s1", [
      [0.1, 0.1],
      [0.2, 0.2],
    ]);
    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (doc) => addStrokeToPage(doc, "1", added),
      {
        change: { kind: "addStroke", pageKey: "1", stroke: added },
      },
    );

    const afterAdd = useAppStore.getState().freeWriteAnnotationDoc;
    expect(afterAdd.pages["2"]).toBe(otherPage);
    expect(afterAdd.pages["1"]?.strokes[0]?.id).toBe("s1");

    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes ?? [],
    ).toEqual([]);
    expect(useAppStore.getState().freeWriteAnnotationDoc.pages["2"]).toBe(
      otherPage,
    );

    useAppStore.getState().redoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes[0]?.id,
    ).toBe("s1");
  });

  it("undo/redo erase via replaceStrokes", () => {
    const a = stroke("a", [
      [0, 0],
      [1, 1],
    ]);
    const b = stroke("b", [
      [0.2, 0.2],
      [0.3, 0.3],
    ]);
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [a, b], texts: [] };
    useAppStore.setState({ freeWriteAnnotationDoc: doc });

    const after = [b];
    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (d) => replacePageStrokes(d, "1", after),
      {
        change: {
          kind: "replaceStrokes",
          pageKey: "1",
          before: [a, b],
          after,
        },
      },
    );
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes.map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);

    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes.map(
        (s) => s.id,
      ),
    ).toEqual(["a", "b"]);

    useAppStore.getState().redoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes.map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
  });

  it("undo/redo text create and drag", () => {
    const box: PdfTextBox = {
      id: "t1",
      x: 0.1,
      y: 0.2,
      w: 0.3,
      body: "",
    };
    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (doc) => addTextToPage(doc, "1", box),
      { change: { kind: "addText", pageKey: "1", box } },
    );
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.texts[0]?.id,
    ).toBe("t1");

    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (doc) => moveTextOnPage(doc, "1", "t1", { x: 0.5, y: 0.6 }),
      {
        change: {
          kind: "moveText",
          pageKey: "1",
          id: "t1",
          from: { x: 0.1, y: 0.2 },
          to: { x: 0.5, y: 0.6 },
        },
      },
    );
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.texts[0],
    ).toMatchObject({ x: 0.5, y: 0.6 });

    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.texts[0],
    ).toMatchObject({ x: 0.1, y: 0.2 });

    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.texts ?? [],
    ).toEqual([]);

    useAppStore.getState().redoFreeWriteAnnotation();
    useAppStore.getState().redoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.texts[0],
    ).toMatchObject({ id: "t1", x: 0.5, y: 0.6 });
  });

  it("mixed stroke then erase then text undoes in reverse order", () => {
    const s1 = stroke("s1", [
      [0.1, 0.1],
      [0.2, 0.2],
    ]);
    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (doc) => addStrokeToPage(doc, "1", s1),
      { change: { kind: "addStroke", pageKey: "1", stroke: s1 } },
    );
    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (doc) => replacePageStrokes(doc, "1", []),
      {
        change: {
          kind: "replaceStrokes",
          pageKey: "1",
          before: [s1],
          after: [],
        },
      },
    );
    const box: PdfTextBox = {
      id: "t1",
      x: 0.4,
      y: 0.4,
      w: 0.2,
      body: "x",
    };
    useAppStore.getState().applyFreeWriteAnnotationUpdater(
      (doc) => addTextToPage(doc, "1", box),
      { change: { kind: "addText", pageKey: "1", box } },
    );

    expect(useAppStore.getState().freeWriteUndoDepth).toBe(3);
    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.texts ?? [],
    ).toEqual([]);
    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes[0]?.id,
    ).toBe("s1");
    useAppStore.getState().undoFreeWriteAnnotation();
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"]?.strokes ?? [],
    ).toEqual([]);
  });

  it("caps undo stack at 50 entries", () => {
    for (let i = 0; i < 55; i += 1) {
      const s = stroke(`s${i}`, [
        [0, 0],
        [0.1, 0.1],
      ]);
      useAppStore.getState().applyFreeWriteAnnotationUpdater(
        (doc) => addStrokeToPage(doc, "1", s),
        { change: { kind: "addStroke", pageKey: "1", stroke: s } },
      );
    }
    expect(useAppStore.getState().freeWriteUndoDepth).toBe(50);
  });
});
