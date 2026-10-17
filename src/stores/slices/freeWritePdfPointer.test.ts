// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("freeWrite PDF pointer tool", () => {
  beforeEach(() => {
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
});
