import { describe, expect, it } from "vitest";
import {
  createDefaultSectionStack,
  ensureSectionExpanded,
  normalizeSectionStack,
  toggleStackMinimized,
} from "./sectionStack";

describe("ensureSectionExpanded", () => {
  it("returns the stack unchanged when teaching is already expanded", () => {
    const stack = createDefaultSectionStack();
    expect(ensureSectionExpanded(stack, "teaching")).toBe(stack);
    expect(stack.minimized.teaching).toBeUndefined();
  });

  it("expands a minimized teaching section and restores its weight", () => {
    const minimized = toggleStackMinimized(
      createDefaultSectionStack(),
      "teaching",
    );
    expect(minimized.minimized.teaching).toBe(true);
    const savedWeight = minimized.expandedWeights?.teaching;

    const expanded = ensureSectionExpanded(minimized, "teaching");
    expect(expanded.minimized.teaching).toBeUndefined();
    if (savedWeight != null) {
      expect(expanded.weights.teaching).toBe(savedWeight);
    }
  });
});

describe("normalizeSectionStack migrates legacy stack ids", () => {
  it("maps phrases to teaching and drops quick-actions", () => {
    const migrated = normalizeSectionStack({
      order: ["quick-actions", "phrases"],
      weights: {
        "quick-actions": 10,
        phrases: 42,
        "input-row": 50,
      },
      minimized: { phrases: true },
      expandedWeights: { phrases: 42 },
      undocked: {},
    } as unknown as ReturnType<typeof createDefaultSectionStack>);

    expect(migrated.order).toEqual(["teaching"]);
    expect(migrated.weights.teaching).toBe(42);
    expect(migrated.minimized.teaching).toBe(true);
    expect(Object.keys(migrated.weights).sort()).toEqual(
      ["input-row", "teaching"].sort(),
    );
  });
});
