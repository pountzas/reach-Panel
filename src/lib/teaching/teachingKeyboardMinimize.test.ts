import { describe, expect, it } from "vitest";
import {
  createDefaultSectionStack,
  resolveDockedSlots,
} from "../sectionStack";
import { sectionHeaderHeightPx } from "../sectionLayouts";
import {
  isTeachingKeyboardChromeVisible,
  isTeachingKeyboardTypingTargetActive,
  nextTeachingKeyboardMinimizeState,
} from "./teachingKeyboardMinimize";

describe("isTeachingKeyboardChromeVisible", () => {
  it("is true only for language/math while teaching is enabled", () => {
    expect(
      isTeachingKeyboardChromeVisible({
        musicTeachingEnabled: true,
        teachingLesson: "language",
      }),
    ).toBe(true);
    expect(
      isTeachingKeyboardChromeVisible({
        musicTeachingEnabled: true,
        teachingLesson: "math",
      }),
    ).toBe(true);
    expect(
      isTeachingKeyboardChromeVisible({
        musicTeachingEnabled: true,
        teachingLesson: "music",
      }),
    ).toBe(false);
    expect(
      isTeachingKeyboardChromeVisible({
        musicTeachingEnabled: false,
        teachingLesson: "language",
      }),
    ).toBe(false);
  });
});

describe("nextTeachingKeyboardMinimizeState", () => {
  it("enabling Focus forces minimized on", () => {
    expect(
      nextTeachingKeyboardMinimizeState({
        teachingKeyboardMinimized: false,
        teachingKeyboardAutoFocus: false,
        action: { type: "setAutoFocus", value: true },
      }),
    ).toEqual({
      teachingKeyboardMinimized: true,
      teachingKeyboardAutoFocus: true,
    });
  });

  it("disabling Focus leaves minimized unchanged", () => {
    expect(
      nextTeachingKeyboardMinimizeState({
        teachingKeyboardMinimized: true,
        teachingKeyboardAutoFocus: true,
        action: { type: "setAutoFocus", value: false },
      }),
    ).toEqual({
      teachingKeyboardMinimized: true,
      teachingKeyboardAutoFocus: false,
    });
  });

  it("leaving chrome lessons clears both flags", () => {
    expect(
      nextTeachingKeyboardMinimizeState({
        teachingKeyboardMinimized: true,
        teachingKeyboardAutoFocus: true,
        action: { type: "reset" },
      }),
    ).toEqual({
      teachingKeyboardMinimized: false,
      teachingKeyboardAutoFocus: false,
    });
  });
});

describe("isTeachingKeyboardTypingTargetActive", () => {
  it("is true for free-write notepad/pdfText and spelling capture", () => {
    expect(
      isTeachingKeyboardTypingTargetActive({
        freeWriteCapture: true,
        spellingCapture: false,
      }),
    ).toBe(true);
    expect(
      isTeachingKeyboardTypingTargetActive({
        freeWriteCapture: false,
        spellingCapture: true,
      }),
    ).toBe(true);
    expect(
      isTeachingKeyboardTypingTargetActive({
        freeWriteCapture: false,
        spellingCapture: false,
      }),
    ).toBe(false);
  });
});

describe("resolveDockedSlots forceMinimized", () => {
  it("collapses input-row to header height without touching persisted stack.minimized", () => {
    const stack = createDefaultSectionStack();
    const headerH = sectionHeaderHeightPx();
    const slots = resolveDockedSlots(
      stack,
      { teaching: true },
      600,
      4,
      { forceMinimized: { "input-row": true } },
    );
    const input = slots.find((s) => s.id === "input-row");
    const teaching = slots.find((s) => s.id === "teaching");
    expect(input?.isMinimized).toBe(true);
    expect(input?.height).toBe(headerH);
    expect(teaching?.height ?? 0).toBeGreaterThan(headerH);
    expect(stack.minimized["input-row"]).toBeUndefined();
  });
});
