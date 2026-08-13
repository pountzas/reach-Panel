import { describe, expect, it } from "vitest";
import {
  createDefaultSectionStack,
  ensureSectionExpanded,
  toggleStackMinimized,
} from "./sectionStack";

describe("ensureSectionExpanded", () => {
  it("returns the stack unchanged when the section is already expanded", () => {
    const stack = createDefaultSectionStack();
    expect(ensureSectionExpanded(stack, "phrases")).toBe(stack);
    expect(stack.minimized.phrases).toBeUndefined();
  });

  it("expands a minimized section and restores its weight", () => {
    const minimized = toggleStackMinimized(createDefaultSectionStack(), "phrases");
    expect(minimized.minimized.phrases).toBe(true);
    const savedWeight = minimized.expandedWeights?.phrases;

    const expanded = ensureSectionExpanded(minimized, "phrases");
    expect(expanded.minimized.phrases).toBeUndefined();
    if (savedWeight != null) {
      expect(expanded.weights.phrases).toBe(savedWeight);
    }
  });
});
