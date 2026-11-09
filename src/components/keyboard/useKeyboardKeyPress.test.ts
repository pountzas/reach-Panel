// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import type { KeyPressContext } from "./useKeyboardKeyPress";
import { useKeyboardKeyPress } from "./useKeyboardKeyPress";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

const languagePlaying = {
  musicTeachingEnabled: true,
  teachingLesson: "language" as const,
  settings: { keyboardSectionMode: "synthesizer" },
  languageLessonPlaying: true,
  languageSubjectTab: "spelling" as const,
};

function context(overrides: Partial<KeyPressContext> = {}): KeyPressContext {
  return {
    pollKeyboardState: vi.fn(),
    loadInputMethods: vi.fn(),
    languagePickerOpen: false,
    setLanguagePickerOpen: vi.fn(),
    dictateDisabled: false,
    toggleDictation: vi.fn(),
    languageLessonMode: languagePlaying,
    languageListAuthoringHandlers: null,
    languageListAuthoringActive: false,
    languageBackspace: vi.fn(),
    greekKeyboardActive: false,
    physicalKeyState: { capsLock: false, systemHkl: 0 },
    fnActive: false,
    translateLayoutKey: vi.fn(),
    applyLanguageLayoutTranslation: vi.fn(),
    settings: { fnKeyMode: "one-shot" },
    activeModifiers: [],
    clearStickyExceptFn: vi.fn(),
    clearSticky: vi.fn(),
    languageKeyInput: vi.fn(),
    freeWriteCaptureActive: false,
    freeWriteNotepadBackspace: vi.fn(),
    greekFreeWriteActive: false,
    freeWriteNotepadInput: vi.fn(),
    applyFreeWriteLayoutTranslation: vi.fn(),
    freeWritePdfFocus: false,
    toggleSticky: vi.fn(),
    toggleCaptureCapsLock: vi.fn(),
    backspaceTyped: vi.fn(),
    loadSuggestions: vi.fn(),
    recordTypedWord: vi.fn(),
    setTypedBuffer: vi.fn(),
    typeCharacter: vi.fn(),
    applyTypedLayoutTranslation: vi.fn(),
    shiftActive: false,
    typingLocale: "en-US",
    checkLanguageAnswer: vi.fn(),
    ...overrides,
  };
}

describe("useKeyboardKeyPress teaching capture", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("latches Shift during a language lesson", async () => {
    const ctx = context();
    const { result } = renderHook(() => useKeyboardKeyPress(ctx));

    await result.current({ key: "shift", label: "Shift", modifier: true });

    expect(ctx.toggleSticky).toHaveBeenCalledWith("shift");
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(["ctrl", "win", "alt", "fn"])(
    "latches %s during a language lesson",
    async (modifier) => {
      const ctx = context();
      const { result } = renderHook(() => useKeyboardKeyPress(ctx));

      await result.current({ key: modifier, label: modifier, modifier: true });

      expect(ctx.toggleSticky).toHaveBeenCalledWith(modifier);
    },
  );

  it("latches Shift during Free Write capture", async () => {
    const ctx = context({
      languageLessonMode: {
        ...languagePlaying,
        languageLessonPlaying: false,
      },
      freeWriteCaptureActive: true,
    });
    const { result } = renderHook(() => useKeyboardKeyPress(ctx));

    await result.current({ key: "shift", label: "Shift", modifier: true });

    expect(ctx.toggleSticky).toHaveBeenCalledWith("shift");
  });

  it("toggles Caps inside language capture without injecting a key", async () => {
    const physicalKeyState = { capsLock: false, systemHkl: 0 };
    const ctx = context({
      physicalKeyState,
      toggleCaptureCapsLock: () => {
        physicalKeyState.capsLock = !physicalKeyState.capsLock;
      },
    });
    const { result } = renderHook(() => useKeyboardKeyPress(ctx));

    await result.current({
      key: "capslock",
      label: "Caps",
      modifier: true,
    });
    await result.current({ key: "a", label: "a", physicalKey: "a" });

    expect(invoke).not.toHaveBeenCalled();
    expect(ctx.languageKeyInput).toHaveBeenCalledWith("A", {
      physicalKey: "a",
    });
  });

  it("toggles Caps inside Free Write capture without injecting a key", async () => {
    const physicalKeyState = { capsLock: false, systemHkl: 0 };
    const ctx = context({
      languageLessonMode: {
        ...languagePlaying,
        languageLessonPlaying: false,
      },
      freeWriteCaptureActive: true,
      physicalKeyState,
      toggleCaptureCapsLock: () => {
        physicalKeyState.capsLock = !physicalKeyState.capsLock;
      },
    });
    const { result } = renderHook(() => useKeyboardKeyPress(ctx));

    await result.current({
      key: "capslock",
      label: "Caps",
      modifier: true,
    });
    await result.current({ key: "b", label: "b", physicalKey: "b" });

    expect(invoke).not.toHaveBeenCalled();
    expect(ctx.freeWriteNotepadInput).toHaveBeenCalledWith("B");
  });

  it("still injects Caps when Teaching capture is off", async () => {
    const ctx = context({
      languageLessonMode: {
        ...languagePlaying,
        languageLessonPlaying: false,
      },
    });
    const { result } = renderHook(() => useKeyboardKeyPress(ctx));

    await result.current({
      key: "capslock",
      label: "Caps",
      modifier: true,
    });

    expect(invoke).toHaveBeenCalledWith("cmd_press_key", {
      request: { key: "capslock", modifiers: [] },
    });
    expect(ctx.pollKeyboardState).toHaveBeenCalled();
  });

  it("clears sticky Shift after a captured letter", async () => {
    const ctx = context({
      shiftActive: true,
      activeModifiers: ["shift"],
    });
    const { result } = renderHook(() => useKeyboardKeyPress(ctx));

    await result.current({ key: "a", label: "a", physicalKey: "a" });

    expect(ctx.languageKeyInput).toHaveBeenCalledWith("A", {
      physicalKey: "a",
    });
    expect(ctx.clearSticky).toHaveBeenCalled();
  });
});
