import { describe, expect, it } from "vitest";
import { resolveDockedSectionVisibility } from "./sectionRegistry";
import {
  V1_HIDDEN_FEATURES,
  effectiveMouseVisible,
  isMusicLessonSlotVisible,
  isTeachingFullWorkArea,
  isV1FeatureHidden,
} from "./v1HiddenFeatures";

describe("v1HiddenFeatures", () => {
  it("exposes only the mouse gate", () => {
    expect(V1_HIDDEN_FEATURES).toEqual({ mouse: true });
    expect(Object.keys(V1_HIDDEN_FEATURES)).toEqual(["mouse"]);
  });

  it("isV1FeatureHidden mirrors the mouse constant", () => {
    expect(isV1FeatureHidden("mouse")).toBe(V1_HIDDEN_FEATURES.mouse);
  });

  it("forces mouse chrome off while the flag is on", () => {
    expect(effectiveMouseVisible(true)).toBe(false);
    expect(effectiveMouseVisible(false)).toBe(false);
  });

  it("treats music lesson slot as teaching + synthesizer only", () => {
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: true,
        keyboardSectionMode: "synthesizer",
      }),
    ).toBe(true);
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: true,
        keyboardSectionMode: "keyboard",
      }),
    ).toBe(false);
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: false,
        keyboardSectionMode: "synthesizer",
      }),
    ).toBe(false);
  });

  it("keeps lesson slot for any teaching lesson while teaching + synth", () => {
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: true,
        keyboardSectionMode: "synthesizer",
        teachingLesson: "music",
      }),
    ).toBe(true);
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: true,
        keyboardSectionMode: "synthesizer",
        teachingLesson: "math",
      }),
    ).toBe(true);
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: true,
        keyboardSectionMode: "synthesizer",
        teachingLesson: "language",
      }),
    ).toBe(true);
    expect(
      isMusicLessonSlotVisible({
        musicTeachingEnabled: true,
        keyboardSectionMode: "keyboard",
        teachingLesson: "math",
      }),
    ).toBe(false);
  });

  it("matches full work area to teaching + synthesizer", () => {
    expect(
      isTeachingFullWorkArea({
        musicTeachingEnabled: true,
        keyboardSectionMode: "synthesizer",
      }),
    ).toBe(true);
    expect(
      isTeachingFullWorkArea({
        musicTeachingEnabled: false,
        keyboardSectionMode: "synthesizer",
      }),
    ).toBe(false);
  });
});

describe("teaching section visibility", () => {
  it("hides teaching when lesson slot is off", () => {
    expect(
      resolveDockedSectionVisibility({
        lessonSlotVisible: false,
      }),
    ).toEqual({ teaching: false });
  });

  it("shows teaching only when lesson slot is visible", () => {
    expect(
      resolveDockedSectionVisibility({
        lessonSlotVisible: true,
      }),
    ).toEqual({ teaching: true });
  });
});
