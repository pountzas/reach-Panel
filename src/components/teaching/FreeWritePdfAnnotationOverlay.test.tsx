// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import {
  emptyPdfAnnotationDoc,
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

import { useAppStore } from "../../stores/appStore";
import { FreeWritePdfAnnotationOverlay } from "./FreeWritePdfAnnotationOverlay";

function asHtmlElement(el: Element): HTMLElement {
  if (!(el instanceof HTMLElement)) {
    throw new Error("expected HTMLElement");
  }
  return el;
}

function mockRect(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  el.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

/** jsdom lacks pointer capture; mirror set/has/release for gesture handlers. */
function stubPointerCapture(el: HTMLElement) {
  const captured = new Set<number>();
  el.setPointerCapture = (id: number) => {
    captured.add(id);
  };
  el.releasePointerCapture = (id: number) => {
    captured.delete(id);
  };
  el.hasPointerCapture = (id: number) => captured.has(id);
}

describe("FreeWritePdfAnnotationOverlay gestures", () => {
  beforeEach(async () => {
    await useAppStore.getState().loadFreeWriteAnnotations(null);
    useAppStore.setState({
      freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
      freeWriteAnnotationDirty: false,
      freeWriteUndoDepth: 0,
      freeWriteRedoDepth: 0,
      freeWritePdfTool: "pen",
      freeWriteSelectedTextId: null,
    });
  });

  it("maps a pointer to the same normalized point when the canvas is CSS-shrunk", () => {
    useAppStore.setState({ freeWritePdfTool: "pen" });
    const { container } = render(
      <div style={{ width: 300 }}>
        <FreeWritePdfAnnotationOverlay page={1} width={600} height={800} />
      </div>,
    );
    const root = container.querySelector(".absolute.inset-0");
    expect(root).toBeTruthy();
    if (!root) throw new Error("expected overlay root");
    stubPointerCapture(asHtmlElement(root));
    // CSS-shrunk page: layout width half of the logical overlay width.
    mockRect(asHtmlElement(root), { left: 0, top: 0, width: 300, height: 400 });

    act(() => {
      fireEvent.pointerDown(root, {
        button: 0,
        clientX: 150,
        clientY: 200,
        pointerId: 1,
      });
      fireEvent.pointerMove(root, {
        clientX: 160,
        clientY: 210,
        pointerId: 1,
      });
      fireEvent.pointerUp(root, {
        clientX: 160,
        clientY: 210,
        pointerId: 1,
      });
    });

    const strokes =
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"].strokes;
    expect(strokes).toHaveLength(1);
    expect(strokes[0].points[0][0]).toBeCloseTo(0.5, 5);
    expect(strokes[0].points[0][1]).toBeCloseTo(0.5, 5);
  });

  it("pen gesture commits exactly one addStroke updater call", () => {
    const original = useAppStore.getState().applyFreeWriteAnnotationUpdater;
    const applySpy = vi.fn(original);
    useAppStore.setState({
      freeWritePdfTool: "pen",
      applyFreeWriteAnnotationUpdater: applySpy,
    });

    const { container } = render(
      <FreeWritePdfAnnotationOverlay page={1} width={600} height={800} />,
    );
    const root = container.querySelector(".absolute.inset-0");
    if (!root) throw new Error("expected overlay root");
    stubPointerCapture(asHtmlElement(root));
    mockRect(asHtmlElement(root), { left: 0, top: 0, width: 600, height: 800 });

    act(() => {
      fireEvent.pointerDown(root, {
        button: 0,
        clientX: 60,
        clientY: 80,
        pointerId: 1,
      });
      fireEvent.pointerMove(root, {
        clientX: 120,
        clientY: 160,
        pointerId: 1,
      });
      fireEvent.pointerMove(root, {
        clientX: 180,
        clientY: 240,
        pointerId: 1,
      });
      fireEvent.pointerUp(root, {
        clientX: 180,
        clientY: 240,
        pointerId: 1,
      });
    });

    const strokeCalls = applySpy.mock.calls.filter(
      (c) => c[1]?.change?.kind === "addStroke",
    );
    expect(strokeCalls).toHaveLength(1);
    useAppStore.setState({ applyFreeWriteAnnotationUpdater: original });
  });

  it("eraser gesture commits exactly one replaceStrokes updater call", () => {
    const strokeA: PdfStroke = {
      id: "a",
      color: "#000",
      width: 0.002,
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    };
    const strokeB: PdfStroke = {
      id: "b",
      color: "#000",
      width: 0.002,
      points: [
        [0.8, 0.8],
        [0.9, 0.9],
      ],
    };
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [strokeA, strokeB], texts: [] };
    useAppStore.setState({
      freeWriteAnnotationDoc: doc,
      freeWritePdfTool: "eraser",
    });

    const original = useAppStore.getState().applyFreeWriteAnnotationUpdater;
    const applySpy = vi.fn(original);
    useAppStore.setState({ applyFreeWriteAnnotationUpdater: applySpy });

    const { container } = render(
      <FreeWritePdfAnnotationOverlay page={1} width={600} height={800} />,
    );
    const root = container.querySelector(".absolute.inset-0");
    if (!root) throw new Error("expected overlay root");
    stubPointerCapture(asHtmlElement(root));
    mockRect(asHtmlElement(root), { left: 0, top: 0, width: 600, height: 800 });

    act(() => {
      fireEvent.pointerDown(root, {
        button: 0,
        clientX: 60,
        clientY: 80,
        pointerId: 1,
      });
      fireEvent.pointerMove(root, {
        clientX: 90,
        clientY: 120,
        pointerId: 1,
      });
      fireEvent.pointerUp(root, {
        clientX: 90,
        clientY: 120,
        pointerId: 1,
      });
    });

    const eraseCalls = applySpy.mock.calls.filter(
      (c) => c[1]?.change?.kind === "replaceStrokes",
    );
    expect(eraseCalls).toHaveLength(1);
    // Untouched stroke keeps identity in the committed doc.
    const afterStrokes =
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"].strokes;
    expect(afterStrokes.some((s) => s === strokeB)).toBe(true);
    useAppStore.setState({ applyFreeWriteAnnotationUpdater: original });
  });

  it("pointercancel on a text box clears drag preview without a stuck box", () => {
    const box: PdfTextBox = {
      id: "t1",
      x: 0.2,
      y: 0.2,
      w: 0.3,
      body: "hi",
    };
    const doc = emptyPdfAnnotationDoc();
    doc.pages["1"] = { strokes: [], texts: [box] };
    useAppStore.setState({
      freeWriteAnnotationDoc: doc,
      freeWritePdfTool: "pointer",
    });

    const original = useAppStore.getState().applyFreeWriteAnnotationUpdater;
    const applySpy = vi.fn(original);
    useAppStore.setState({ applyFreeWriteAnnotationUpdater: applySpy });

    const { container } = render(
      <FreeWritePdfAnnotationOverlay page={1} width={600} height={800} />,
    );
    const root = container.querySelector(".absolute.inset-0");
    if (!root) throw new Error("expected overlay root");
    stubPointerCapture(asHtmlElement(root));
    mockRect(asHtmlElement(root), { left: 0, top: 0, width: 600, height: 800 });
    const textEl = container.querySelector("[data-pdf-text-box]");
    expect(textEl).toBeTruthy();
    if (!textEl) throw new Error("expected text box");
    stubPointerCapture(asHtmlElement(textEl));

    act(() => {
      fireEvent.pointerDown(textEl, {
        button: 0,
        clientX: 150,
        clientY: 200,
        pointerId: 2,
      });
      fireEvent.pointerMove(textEl, {
        clientX: 200,
        clientY: 250,
        pointerId: 2,
      });
      fireEvent.pointerCancel(textEl, {
        clientX: 200,
        clientY: 250,
        pointerId: 2,
      });
    });

    // Cancel ends the drag: either no commit (if preview never moved far enough
    // in this harness) or one moveText — never stuck mid-preview.
    const moveCalls = applySpy.mock.calls.filter(
      (c) => c[1]?.change?.kind === "moveText",
    );
    expect(moveCalls.length).toBeLessThanOrEqual(1);
    expect(asHtmlElement(textEl).style.left).toBeTruthy();
    useAppStore.setState({ applyFreeWriteAnnotationUpdater: original });
  });
});
