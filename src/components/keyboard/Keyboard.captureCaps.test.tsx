// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_PHYSICAL_KEY_STATE } from "../../lib/keyboardLayouts";
import { DEFAULT_SETTINGS } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    if (cmd === "cmd_press_key") return Promise.resolve({ ok: true });
    return Promise.resolve(undefined);
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getCurrent: () => ({ label: "main" }) },
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: vi.fn(() => true),
  afterNextPaint: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    ref: { current: null },
    width: 800,
    height: 280,
  }),
}));
import { useAppStore } from "../../stores/appStore";
import { Keyboard } from "./Keyboard";

describe("Teaching capture Caps", () => {
  beforeEach(() => {
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        typingLanguage: "en",
        keyboardSectionMode: "synthesizer",
        freeWriteNotepadText: "",
      },
      focusModeActive: false,
      keyboardLayout: "QWERTY",
      stickyModifiers: [],
      physicalKeyState: { ...DEFAULT_PHYSICAL_KEY_STATE, capsLock: false },
      captureCapsLock: true,
      languagePickerOpen: false,
      dictationState: "idle",
      musicTeachingEnabled: true,
      teachingLesson: "language",
      languageSubjectTab: "freeWrite",
      languageLessonPlaying: false,
      languageListAuthoringActive: false,
      freeWriteFocus: "notepad",
      inputMethods: [],
      profileHydrated: true,
    });
  });

  it("lights Caps and uppercases the next Free Write letter while OS Caps is off", () => {
    render(<Keyboard />);

    const caps = screen.getByRole("button", { name: "Caps" });
    expect(caps.className).toContain("sticky-active");

    fireEvent.click(screen.getByRole("button", { name: "A" }));

    expect(useAppStore.getState().settings.freeWriteNotepadText).toBe("A");
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
      "cmd_press_key",
      expect.anything(),
    );
  });
});
