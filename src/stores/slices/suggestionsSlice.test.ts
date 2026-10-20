// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/types";

const { invokeMock, notifyError } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, ...rest: unknown[]) => {
    if (cmd === "cmd_get_input_focused") {
      return Promise.resolve(false);
    }
    return invokeMock(cmd, ...rest);
  },
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
  notify: { error: (...args: unknown[]) => notifyError(...args) },
}));

import { useAppStore } from "../appStore";
import { storeFlags } from "../storeFlags";

describe("applySuggestion", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    notifyError.mockReset();
    storeFlags.lastAnnouncedError = null;
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
      },
      typedBuffer: "hel",
      suggestions: ["hello"],
      musicTeachingEnabled: false,
      lastError: null,
    });
  });

  it("surfaces IPC failure from cmd_type_text and does not record the word", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_type_text") {
        return Promise.resolve({ success: false, error: "x" });
      }
      if (cmd === "cmd_get_suggestions") {
        return Promise.resolve([]);
      }
      return Promise.resolve({ success: true });
    });

    await useAppStore.getState().applySuggestion("hello");

    expect(notifyError).toHaveBeenCalledWith("x");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_record_word",
      expect.anything(),
    );
    expect(useAppStore.getState().typedBuffer).toBe("hel");
  });

  it("rolls typedBuffer back only by the chars deleted when cmd_type_text fails after backspaces", async () => {
    useAppStore.setState({ typedBuffer: "foo hel" });
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_type_text") {
        return Promise.resolve({ success: false, error: "type failed" });
      }
      return Promise.resolve({ success: true });
    });

    await useAppStore.getState().applySuggestion("world");

    const backspaces = invokeMock.mock.calls.filter(
      ([cmd]) => cmd === "cmd_press_key",
    );
    expect(backspaces).toHaveLength(3);
    expect(notifyError).toHaveBeenCalledWith("type failed");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_record_word",
      expect.anything(),
    );
    expect(useAppStore.getState().typedBuffer).toBe("foo ");
  });

  it("types the suffix and records the word on success", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_get_suggestions") return Promise.resolve([]);
      if (cmd === "cmd_record_word") return Promise.resolve(null);
      return Promise.resolve({ success: true });
    });

    await useAppStore.getState().applySuggestion("hello");

    expect(invokeMock).toHaveBeenCalledWith("cmd_type_text", { text: "lo " });
    expect(invokeMock).toHaveBeenCalledWith(
      "cmd_record_word",
      expect.objectContaining({ word: "hello" }),
    );
    expect(notifyError).not.toHaveBeenCalled();
    expect(useAppStore.getState().typedBuffer).toBe("hello ");
  });

  it("applies into the Free write notepad instead of OS inject", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_get_suggestions") return Promise.resolve([]);
      if (cmd === "cmd_record_word") return Promise.resolve(null);
      return Promise.resolve({ success: true });
    });
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "notepad",
      typedBuffer: "hel",
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        freeWriteNotepadText: "hel",
        showTeachingInputHelpers: true,
      },
    });

    await useAppStore.getState().applySuggestion("hello");

    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_type_text",
      expect.anything(),
    );
    expect(useAppStore.getState().settings.freeWriteNotepadText).toBe("hello ");
    expect(useAppStore.getState().typedBuffer).toBe("hello ");
  });

  it("applies into the spelling buffer instead of OS inject", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_get_suggestions") return Promise.resolve([]);
      if (cmd === "cmd_record_word") return Promise.resolve(null);
      return Promise.resolve({ success: true });
    });
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "spelling",
      languageLessonPlaying: true,
      languageInputBuffer: "hel",
      typedBuffer: "hel",
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        showTeachingInputHelpers: true,
      },
    });

    await useAppStore.getState().applySuggestion("hello");

    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_type_text",
      expect.anything(),
    );
    expect(useAppStore.getState().languageInputBuffer).toBe("hello");
    expect(useAppStore.getState().typedBuffer).toBe("hello ");
  });

  it("applies into the selected Free write PDF text box instead of notepad or OS", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_get_suggestions") return Promise.resolve([]);
      if (cmd === "cmd_record_word") return Promise.resolve(null);
      return Promise.resolve({ success: true });
    });
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "pdfText",
      freeWriteSelectedTextId: "t1",
      freeWriteAnnotationDoc: {
        schemaVersion: 1,
        pages: {
          "1": {
            strokes: [],
            texts: [{ id: "t1", x: 0, y: 0, w: 100, body: "hel" }],
          },
        },
      },
      typedBuffer: "hel",
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        freeWriteNotepadText: "notepad untouched",
        showTeachingInputHelpers: true,
      },
    });

    await useAppStore.getState().applySuggestion("hello");

    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_type_text",
      expect.anything(),
    );
    expect(useAppStore.getState().settings.freeWriteNotepadText).toBe(
      "notepad untouched",
    );
    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"].texts[0].body,
    ).toBe("hello ");
    expect(useAppStore.getState().typedBuffer).toBe("hello ");
  });
});

describe("Teaching suggestion production", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    notifyError.mockReset();
    storeFlags.lastAnnouncedError = null;
    storeFlags.suggestionsRequestId = 0;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_get_suggestions") {
        return Promise.resolve([{ word: "hello" }]);
      }
      return Promise.resolve({ success: true });
    });
  });

  it("loads suggestions from the spelling buffer after Teaching key input", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "spelling",
      languageLessonPlaying: true,
      languageInputBuffer: "",
      typedBuffer: "",
      suggestions: [],
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        showTeachingInputHelpers: true,
      },
    });

    useAppStore.getState().languageKeyInput("h");
    useAppStore.getState().languageKeyInput("e");

    expect(useAppStore.getState().languageInputBuffer).toBe("he");
    expect(useAppStore.getState().typedBuffer).toBe("he");
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "cmd_get_suggestions",
        expect.objectContaining({ prefix: "he" }),
      );
    });
    await vi.waitFor(() => {
      expect(useAppStore.getState().suggestions).toEqual(["hello"]);
    });
  });

  it("clears suggestions after spelling backspace leaves a short prefix", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "spelling",
      languageLessonPlaying: true,
      languageInputBuffer: "he",
      typedBuffer: "he",
      suggestions: ["hello"],
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        showTeachingInputHelpers: true,
      },
    });

    useAppStore.getState().languageBackspace();

    expect(useAppStore.getState().languageInputBuffer).toBe("h");
    expect(useAppStore.getState().typedBuffer).toBe("h");
    await vi.waitFor(() => {
      expect(useAppStore.getState().suggestions).toEqual([]);
    });
  });

  it("loads suggestions from the Free write notepad after typing a prefix", async () => {
    useAppStore.setState({
      profileHydrated: true,
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "notepad",
      typedBuffer: "",
      suggestions: [],
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        freeWriteNotepadText: "",
        showTeachingInputHelpers: true,
      },
    });

    useAppStore.getState().freeWriteNotepadInput("h");
    useAppStore.getState().freeWriteNotepadInput("e");

    expect(useAppStore.getState().settings.freeWriteNotepadText).toBe("he");
    expect(useAppStore.getState().typedBuffer).toBe("he");
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "cmd_get_suggestions",
        expect.objectContaining({ prefix: "he" }),
      );
    });
    await vi.waitFor(() => {
      expect(useAppStore.getState().suggestions).toEqual(["hello"]);
    });
  });

  it("clears suggestions after Free write space like the normal path", async () => {
    useAppStore.setState({
      profileHydrated: true,
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "notepad",
      typedBuffer: "he",
      suggestions: ["hello"],
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        freeWriteNotepadText: "he",
        showTeachingInputHelpers: true,
      },
    });

    useAppStore.getState().freeWriteNotepadInput(" ");

    expect(useAppStore.getState().typedBuffer).toBe("he ");
    await vi.waitFor(() => {
      expect(useAppStore.getState().suggestions).toEqual([]);
    });
  });

  it("loads suggestions from the selected PDF text box after typing a prefix", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "pdfText",
      freeWriteSelectedTextId: "t1",
      freeWriteAnnotationDoc: {
        schemaVersion: 1,
        pages: {
          "1": {
            strokes: [],
            texts: [{ id: "t1", x: 0, y: 0, w: 100, body: "" }],
          },
        },
      },
      typedBuffer: "",
      suggestions: [],
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        showTeachingInputHelpers: true,
      },
    });

    useAppStore.getState().freeWriteNotepadInput("h");
    useAppStore.getState().freeWriteNotepadInput("e");

    expect(
      useAppStore.getState().freeWriteAnnotationDoc.pages["1"].texts[0].body,
    ).toBe("he");
    expect(useAppStore.getState().typedBuffer).toBe("he");
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "cmd_get_suggestions",
        expect.objectContaining({ prefix: "he" }),
      );
    });
    await vi.waitFor(() => {
      expect(useAppStore.getState().suggestions).toEqual(["hello"]);
    });
  });

  it("clears Teaching chips when the PDF text target ends so applySuggestion cannot OS-inject", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "cmd_get_suggestions") {
        return Promise.resolve([{ word: "hello" }]);
      }
      return Promise.resolve({ success: true });
    });
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "pdfText",
      freeWriteSelectedTextId: "t1",
      freeWriteAnnotationDoc: {
        schemaVersion: 1,
        pages: {
          "1": {
            strokes: [],
            texts: [{ id: "t1", x: 0, y: 0, w: 100, body: "" }],
          },
        },
      },
      typedBuffer: "",
      suggestions: [],
      settings: {
        ...DEFAULT_SETTINGS,
        suggestionsVisible: true,
        predictionEnabled: true,
        keyboardSectionMode: "synthesizer",
        showTeachingInputHelpers: true,
      },
    });

    useAppStore.getState().freeWriteNotepadInput("h");
    useAppStore.getState().freeWriteNotepadInput("e");
    await vi.waitFor(() => {
      expect(useAppStore.getState().suggestions).toEqual(["hello"]);
    });

    useAppStore.getState().setFreeWriteSelectedTextId(null);
    expect(useAppStore.getState().typedBuffer).toBe("");
    expect(useAppStore.getState().suggestions).toEqual([]);

    invokeMock.mockClear();
    await useAppStore.getState().applySuggestion("hello");

    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_type_text",
      expect.anything(),
    );
    expect(invokeMock).not.toHaveBeenCalledWith(
      "cmd_press_key",
      expect.anything(),
    );
  });

  it("clears typedBuffer and suggestions when leaving Teaching", async () => {
    useAppStore.setState({
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      freeWriteFocus: "notepad",
      typedBuffer: "hel",
      suggestions: ["hello"],
      settings: {
        ...DEFAULT_SETTINGS,
        keyboardSectionMode: "synthesizer",
      },
    });

    await useAppStore.getState().disableMusicTeaching();

    expect(useAppStore.getState().typedBuffer).toBe("");
    expect(useAppStore.getState().suggestions).toEqual([]);
  });
});
