import { describe, expect, it } from "vitest";
import {
  computeContentHeightRatio,
  computeContentHeightRatioFromSettings,
} from "./sectionLayouts";
import { resolveDockedSectionVisibility } from "./sectionRegistry";
import {
  V1_HIDDEN_FEATURES,
  effectiveLargeHeaders,
  effectiveMouseVisible,
  effectivePhrasesVisible,
  effectiveQuickActionsVisible,
  isMusicLessonSlotVisible,
  isV1FeatureHidden,
  isV1ToolWindowHidden,
  resolveV1SectionVisibility,
} from "./v1HiddenFeatures";

describe("v1HiddenFeatures", () => {
  it("exposes the planned hide flags as true", () => {
    expect(V1_HIDDEN_FEATURES.largeHeaders).toBe(true);
    expect(V1_HIDDEN_FEATURES.mouse).toBe(true);
    expect(V1_HIDDEN_FEATURES.quickActions).toBe(true);
    expect(V1_HIDDEN_FEATURES.phrases).toBe(true);
    expect(V1_HIDDEN_FEATURES.macroBuilder).toBe(true);
    expect(V1_HIDDEN_FEATURES.headTracking).toBe(true);
  });

  it("isV1FeatureHidden mirrors the constant", () => {
    expect(isV1FeatureHidden("mouse")).toBe(V1_HIDDEN_FEATURES.mouse);
    expect(isV1FeatureHidden("phrases")).toBe(V1_HIDDEN_FEATURES.phrases);
  });

  it("forces effective chrome visibility off while flags are on", () => {
    expect(effectiveLargeHeaders(true)).toBe(false);
    expect(effectiveMouseVisible(true)).toBe(false);
    expect(effectiveQuickActionsVisible(true)).toBe(false);
    expect(effectivePhrasesVisible(true)).toBe(false);
    expect(effectivePhrasesVisible(true, true)).toBe(false);
  });

  it("blocks macro-builder and head-tracking tool windows", () => {
    expect(isV1ToolWindowHidden("macro-builder")).toBe(true);
    expect(isV1ToolWindowHidden("head-tracking")).toBe(true);
    expect(isV1ToolWindowHidden("settings")).toBe(false);
  });

  it("treats music lesson slot as teaching + synthesizer only", () => {
    // enableMusicTeaching must not require / write phrasesVisible.
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
});

describe("resolveV1SectionVisibility / content height", () => {
  it("hides QA and phrases when lesson slot is off", () => {
    const visibility = resolveV1SectionVisibility({
      quickActionsVisible: true,
      phrasesVisible: true,
      lessonSlotVisible: false,
    });
    expect(visibility).toEqual({ quickActions: false, phrases: false });
    expect(resolveDockedSectionVisibility({
      quickActionsVisible: true,
      phrasesVisible: true,
      lessonSlotVisible: false,
    })).toEqual(visibility);

    const ratio = computeContentHeightRatioFromSettings(
      { quickActionsVisible: true, phrasesVisible: true },
      false,
    );
    expect(ratio).toBe(computeContentHeightRatio({ quickActions: false, phrases: false }));
    expect(ratio).toBeLessThan(1);
  });

  it("keeps phrases height only when lesson slot is visible", () => {
    const visibility = resolveV1SectionVisibility({
      quickActionsVisible: true,
      phrasesVisible: false,
      lessonSlotVisible: true,
    });
    expect(visibility).toEqual({ quickActions: false, phrases: true });

    const ratio = computeContentHeightRatioFromSettings(
      { quickActionsVisible: true, phrasesVisible: false },
      true,
    );
    expect(ratio).toBe(computeContentHeightRatio({ quickActions: false, phrases: true }));
    expect(ratio).toBeGreaterThan(
      computeContentHeightRatio({ quickActions: false, phrases: false }),
    );
  });
});
