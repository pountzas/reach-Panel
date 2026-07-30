/** Extensible section ids. Keyboard is always the docked base. */
export type SectionId = "quick-actions" | "phrases" | "input-row";

/** Sections that can sit above the keyboard in the stack (and undock). */
export type StackableSectionId = Exclude<SectionId, "input-row">;

export type SectionVisibilityKey = "quickActions" | "phrases";

export interface SectionDefinition {
  id: SectionId;
  /** Relative height weight when expanded in the docked stack. */
  defaultWeight: number;
  canUndock: boolean;
  /** Settings visibility flag; null means always present when the canvas is shown. */
  visibilityKey: SectionVisibilityKey | null;
}

export const KEYBOARD_SECTION_ID: SectionId = "input-row";

export const SECTION_REGISTRY: readonly SectionDefinition[] = [
  {
    id: "quick-actions",
    defaultWeight: 10,
    canUndock: true,
    visibilityKey: "quickActions",
  },
  {
    id: "phrases",
    defaultWeight: 38,
    canUndock: true,
    visibilityKey: "phrases",
  },
  {
    id: "input-row",
    defaultWeight: 50,
    canUndock: false,
    visibilityKey: null,
  },
] as const;

export const DEFAULT_STACK_ORDER: readonly StackableSectionId[] = [
  "quick-actions",
  "phrases",
];

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
