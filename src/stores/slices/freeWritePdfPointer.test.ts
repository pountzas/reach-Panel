// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../../lib/types";

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

const invokeMock = vi.mocked(invoke);

describe("freeWrite PDF pointer tool", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve(false));
    useAppStore.setState({
      freeWritePdfTool: "text",
      freeWriteSelectedTextId: "box-1",
      freeWriteFocus: "pdfText",
    });
  });

  it('setFreeWritePdfTool("pointer") clears selection and sets focus pdf', () => {
    useAppStore.getState().setFreeWritePdfTool("pointer");
    const state = useAppStore.getState();
    expect(state.freeWritePdfTool).toBe("pointer");
    expect(state.freeWriteSelectedTextId).toBeNull();
    expect(state.freeWriteFocus).toBe("pdf");
  });

  it("pointer select path does not set pdfText or force text tool", () => {
    useAppStore.setState({
      freeWritePdfTool: "pointer",
      freeWriteSelectedTextId: null,
      freeWriteFocus: "pdf",
    });
    useAppStore.getState().setFreeWriteSelectedTextId("box-2");
    const state = useAppStore.getState();
    expect(state.freeWritePdfTool).toBe("pointer");
    expect(state.freeWriteSelectedTextId).toBe("box-2");
    expect(state.freeWriteFocus).toBe("pdf");
  });

  it("beginFreeWritePdfTextEdit sets tool text and pdfText focus", () => {
    useAppStore.setState({
      freeWritePdfTool: "pointer",
      freeWriteSelectedTextId: "box-2",
      freeWriteFocus: "pdf",
    });
    useAppStore.getState().beginFreeWritePdfTextEdit("box-2");
    const state = useAppStore.getState();
    expect(state.freeWritePdfTool).toBe("text");
    expect(state.freeWriteSelectedTextId).toBe("box-2");
    expect(state.freeWriteFocus).toBe("pdfText");
  });

  it("clearing selected text id leaves tool as-is and focuses pdf", () => {
    useAppStore.setState({
      freeWritePdfTool: "pointer",
      freeWriteSelectedTextId: "box-2",
      freeWriteFocus: "pdf",
    });
    useAppStore.getState().setFreeWriteSelectedTextId(null);
    const state = useAppStore.getState();
    expect(state.freeWritePdfTool).toBe("pointer");
    expect(state.freeWriteSelectedTextId).toBeNull();
    expect(state.freeWriteFocus).toBe("pdf");
  });

  it("focusing notepad while in text tool switches to pointer and clears selection", () => {
    useAppStore.setState({
      freeWritePdfTool: "text",
      freeWriteSelectedTextId: "box-1",
      freeWriteFocus: "pdfText",
    });
    useAppStore.getState().setFreeWriteFocus("notepad");
    const state = useAppStore.getState();
    expect(state.freeWriteFocus).toBe("notepad");
    expect(state.freeWritePdfTool).toBe("pointer");
    expect(state.freeWriteSelectedTextId).toBeNull();
  });

  it("keeps annotations when closeTeachingPdf cannot flush a dirty save", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_read_teaching_reach_annotations") {
        return Promise.resolve({ json: '{"schemaVersion":1,"pages":{}}' });
      }
      if (cmd === "cmd_write_teaching_reach_annotations") {
        return Promise.reject(new Error("read-only folder"));
      }
      return Promise.resolve(false);
    });

    const strokeDoc = {
      schemaVersion: 1 as const,
      pages: {
        "1": {
          strokes: [
            {
              id: "s1",
              color: "#000",
              width: 0.002,
              points: [
                [0.1, 0.2],
                [0.3, 0.4],
              ] as [number, number][],
            },
          ],
          texts: [],
        },
      },
    };

    await useAppStore.getState().loadFreeWriteAnnotations("C:\\tmp\\lesson.pdf");
    useAppStore.setState({
      freeWriteActivePdfId: "pdf-1",
      teachingPdfLibrary: [
        {
          id: "pdf-1",
          title: "lesson.pdf",
          path: "C:\\tmp\\lesson.pdf",
          lastOpenedAt: new Date().toISOString(),
        },
      ],
      freeWriteAnnotationDoc: strokeDoc,
      freeWriteAnnotationDirty: true,
    });

    await useAppStore.getState().closeTeachingPdf();

    const state = useAppStore.getState();
    expect(state.freeWriteActivePdfId).toBe("pdf-1");
    expect(state.freeWriteAnnotationDoc.pages["1"].strokes[0].id).toBe("s1");
    expect(state.freeWriteAnnotationDirty).toBe(true);
  });

  it("composes Greek accents in PDF text boxes via freeWriteNotepadInput", () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "pdfText",
      freeWriteSelectedTextId: "t1",
      greekPendingAccent: null,
      freeWriteAnnotationDoc: {
        schemaVersion: 1,
        pages: {
          "1": {
            strokes: [],
            texts: [{ id: "t1", x: 0, y: 0, w: 0.2, body: "" }],
          },
        },
      },
      settings: {
        ...DEFAULT_SETTINGS,
        typingLanguage: "el",
        keyboardSectionMode: "synthesizer",
      },
    });

    // Character path receives tonos marks (not literal ";"); see greekCompose tests.
    useAppStore.getState().freeWriteNotepadInput("\u00B4");
    useAppStore.getState().freeWriteNotepadInput("\u03B1");

    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"].texts[0].body,
    ).toBe("\u03AC");
    expect(useAppStore.getState().greekPendingAccent).toBeNull();
  });
});
