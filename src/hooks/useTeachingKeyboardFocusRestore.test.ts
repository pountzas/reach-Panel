// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../lib/types";

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

vi.mock("../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

vi.mock("../lib/notify", () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { useAppStore } from "../stores/appStore";
import { useTeachingKeyboardFocusRestore } from "./useTeachingKeyboardFocusRestore";

function teachingFreeWriteState(
  overrides: Partial<ReturnType<typeof useAppStore.getState>> = {},
) {
  return {
    musicTeachingEnabled: true,
    teachingLesson: "language" as const,
    languageSubjectTab: "freeWrite" as const,
    freeWriteFocus: "notepad" as const,
    languageLessonPlaying: false,
    languageListAuthoringActive: false,
    teachingKeyboardMinimized: false,
    teachingKeyboardAutoFocus: false,
    settings: {
      ...DEFAULT_SETTINGS,
      keyboardSectionMode: "synthesizer" as const,
    },
    ...overrides,
  };
}

describe("useTeachingKeyboardFocusRestore", () => {
  beforeEach(() => {
    useAppStore.setState(teachingFreeWriteState());
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps manual Minimize while Free write notepad capture stays active", () => {
    renderHook(() => useTeachingKeyboardFocusRestore());

    act(() => {
      useAppStore.getState().toggleTeachingKeyboardMinimized();
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(true);
  });

  it("with Focus on, minimizes when leaving an input and restores on re-select", () => {
    useAppStore.setState(
      teachingFreeWriteState({
        teachingKeyboardAutoFocus: true,
        teachingKeyboardMinimized: false,
        freeWriteFocus: "notepad",
      }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    act(() => {
      useAppStore.getState().setFreeWriteFocus("pdf");
    });
    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(true);

    act(() => {
      useAppStore.getState().setFreeWriteFocus("notepad");
    });
    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
  });

  it("restores on physical typing while minimized", () => {
    useAppStore.setState(
      teachingFreeWriteState({ teachingKeyboardMinimized: true }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true }),
      );
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
  });

  it("does not restore on Enter aimed at a focused button", () => {
    useAppStore.setState(
      teachingFreeWriteState({ teachingKeyboardMinimized: true }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    act(() => {
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(true);
  });

  it("with Focus on, restores when tapping an already-selected Teaching input", () => {
    useAppStore.setState(
      teachingFreeWriteState({
        freeWriteFocus: "notepad",
        teachingKeyboardAutoFocus: true,
        teachingKeyboardMinimized: true,
      }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    const textarea = document.createElement("textarea");
    textarea.setAttribute("data-teaching-input", "");
    document.body.appendChild(textarea);

    act(() => {
      textarea.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
  });

  it("does not restore on pointerdown when selecting a PDF text box", () => {
    useAppStore.setState(
      teachingFreeWriteState({
        freeWriteFocus: "pdf",
        freeWritePdfTool: "pointer",
        teachingKeyboardAutoFocus: true,
        teachingKeyboardMinimized: true,
      }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    // Overlay may still mark the box as a Teaching input; select is not edit.
    const box = document.createElement("div");
    box.setAttribute("data-pdf-text-box", "");
    box.setAttribute("data-teaching-input", "");
    document.body.appendChild(box);

    act(() => {
      box.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(true);
  });

  it("restores when Free write focus rises to pdfText", () => {
    useAppStore.setState(
      teachingFreeWriteState({
        freeWriteFocus: "pdf",
        teachingKeyboardAutoFocus: true,
        teachingKeyboardMinimized: true,
      }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    act(() => {
      useAppStore.getState().setFreeWriteFocus("pdfText");
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
  });

  it("restores on pointerdown on a PDF text box with the text tool while already editing", () => {
    useAppStore.setState(
      teachingFreeWriteState({
        freeWriteFocus: "pdfText",
        freeWritePdfTool: "text",
        teachingKeyboardAutoFocus: true,
        teachingKeyboardMinimized: true,
      }),
    );
    renderHook(() => useTeachingKeyboardFocusRestore());

    const box = document.createElement("div");
    box.setAttribute("data-pdf-text-box", "");
    document.body.appendChild(box);

    act(() => {
      box.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(useAppStore.getState().teachingKeyboardMinimized).toBe(false);
  });
});
