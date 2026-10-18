/** Extensible section ids. Keyboard is always the docked base. */
export type SectionId = "teaching" | "input-row";

/** Sections that can sit above the keyboard in the stack (and undock). */
export type StackableSectionId = Exclude<SectionId, "input-row">;

export type SectionVisibilityKey = "teaching";

export interface SectionDefinition {
  id: SectionId;
  /** Relative height weight when expanded in the docked stack. */
  defaultWeight: number;
  canUndock: boolean;
  /** Settings visibility flag; null means always present when the canvas is shown. */
  visibilityKey: SectionVisibilityKey | null;
}

/**
 * Teaching section visibility for the docked stack and window height.
 * Driven only by the music-lesson / teaching slot gate.
 */
export function resolveDockedSectionVisibility(input: {
  lessonSlotVisible?: boolean;
}): Record<SectionVisibilityKey, boolean> {
  return {
    teaching: Boolean(input.lessonSlotVisible),
  };
}

export const KEYBOARD_SECTION_ID: SectionId = "input-row";

export const SECTION_REGISTRY: readonly SectionDefinition[] = [
  {
    id: "teaching",
    defaultWeight: 38,
    canUndock: true,
    visibilityKey: "teaching",
  },
  {
    id: "input-row",
    defaultWeight: 50,
    canUndock: false,
    visibilityKey: null,
  },
] as const;

export const DEFAULT_STACK_ORDER: readonly StackableSectionId[] = ["teaching"];

export function getSectionDefinition(id: SectionId): SectionDefinition {
  const found = SECTION_REGISTRY.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unknown section id: ${id}`);
  }
  return found;
}

export function isStackableSectionId(id: SectionId): id is StackableSectionId {
  return id !== KEYBOARD_SECTION_ID;
}

export function defaultWeightFor(id: SectionId): number {
  return getSectionDefinition(id).defaultWeight;
}

/** Legacy stack ids from pre-teaching profiles. */
const LEGACY_STACKABLE_IDS = new Set(["quick-actions", "phrases", "teaching"]);

export function coerceStackableSectionId(
  id: string,
): StackableSectionId | null {
  if (id === "teaching" || id === "phrases") return "teaching";
  if (id === "quick-actions") return null;
  if (LEGACY_STACKABLE_IDS.has(id)) return null;
  return null;
}
