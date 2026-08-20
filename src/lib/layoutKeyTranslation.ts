import {
  applyGreekKeystroke,
  isGreekDeadKeyPress,
  isGreekDeadPhysicalKey,
  type GreekPendingAccent,
} from "./language/greekCompose";
import {
  greekPhysicalOutput,
  resolveKeyOutput,
  type KeyDef,
} from "./keyboardLayouts";

export type LayoutKeyTranslation = {
  text: string;
  dead: boolean;
};

const SPACING_ACCENT = /^[\u00B4\u0384\u1FFD\u00A8]+/u;

const CODE_TO_PHYSICAL: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: " ",
  ...Object.fromEntries(
    "0123456789".split("").map((d) => [`Digit${d}`, d]),
  ),
  ...Object.fromEntries(
    "abcdefghijklmnopqrstuvwxyz".split("").map((l) => [
      `Key${l.toUpperCase()}`,
      l,
    ]),
  ),
};

/** Map a hardware `KeyboardEvent.code` to the QWERTY physical key id. */
export function physicalKeyFromKeyboardCode(code: string): string | undefined {
  return CODE_TO_PHYSICAL[code];
}

export function isGreekTypingLanguage(language: string | undefined): boolean {
  const primary = language?.toLowerCase().split("-")[0] ?? "";
  return primary === "el";
}

/** On-screen / layout fallback when Windows translate returns empty (e.g. q → ;). */
export function greekTranslateFallback(
  keyDef: KeyDef,
  capsLock: boolean,
  shift: boolean,
  fnActive: boolean,
  locale: string,
): string | undefined {
  const fromPhysical = keyDef.physicalKey
    ? greekPhysicalOutput(keyDef.physicalKey, shift)
    : undefined;
  if (fromPhysical?.length === 1) return fromPhysical;

  const resolved = resolveKeyOutput(keyDef, capsLock, shift, fnActive, locale);
  return resolved.length === 1 ? resolved : undefined;
}

/** Pick the character for a Greek remapped slot; Windows often returns the Latin letter. */
export function resolveGreekSlotCharacter(
  translation: LayoutKeyTranslation,
  physicalKey: string | undefined,
  shift: boolean,
  fallbackOutput?: string,
): string {
  const normalized = normalizeLayoutTranslation(translation);
  const fromPhysical = physicalKey
    ? greekPhysicalOutput(physicalKey, shift)
    : undefined;

  if (fromPhysical && physicalKey) {
    const text = normalized.dead ? "" : normalized.text;
    if (!text || text.toLowerCase() === physicalKey.toLowerCase()) {
      return fromPhysical;
    }
  }

  if (!normalized.dead && normalized.text) return normalized.text;
  if (fallbackOutput?.length === 1) return fallbackOutput;
  if (fromPhysical) return fromPhysical;
  return "";
}

export function greekPhysicalTranslateFallback(
  physicalKey: string,
  shift: boolean,
): string | undefined {
  const fromPhysical = greekPhysicalOutput(physicalKey, shift);
  return fromPhysical?.length === 1 ? fromPhysical : undefined;
}

/** Normalize Windows output so spacing tonos never appears in buffers. */
export function normalizeLayoutTranslation(
  translation: LayoutKeyTranslation,
): LayoutKeyTranslation {
  if (translation.dead) {
    return { text: "", dead: true };
  }
  const stripped = translation.text.replace(SPACING_ACCENT, "");
  if (!stripped) {
    return { text: "", dead: true };
  }
  return { text: stripped, dead: false };
}

export function applyLayoutTranslation(
  buffer: string,
  translation: LayoutKeyTranslation,
): { buffer: string; inject: string } {
  const normalized = normalizeLayoutTranslation(translation);
  if (normalized.dead || !normalized.text) {
    return { buffer, inject: "" };
  }
  return {
    buffer: buffer + normalized.text,
    inject: normalized.text,
  };
}

/** Merge Windows layout translation with JS Greek dead-key compose state. */
export function applyGreekLayoutTranslation(
  buffer: string,
  pending: GreekPendingAccent | null,
  translation: LayoutKeyTranslation,
  options: {
    physicalKey?: string;
    greekCompose: boolean;
    shift?: boolean;
    /** On-screen label output when Windows returns empty/spurious dead (e.g. q → ;). */
    fallbackOutput?: string;
  },
): { buffer: string; pending: GreekPendingAccent | null; inject: string } {
  if (!options.greekCompose) {
    const result = applyLayoutTranslation(buffer, translation);
    return { buffer: result.buffer, pending: null, inject: result.inject };
  }

  const normalized = normalizeLayoutTranslation(translation);
  const prevLen = buffer.length;
  const shift = options.shift ?? false;

  if (normalized.dead && isGreekDeadPhysicalKey(options.physicalKey)) {
    const result = applyGreekKeystroke(buffer, pending, "", options.physicalKey);
    return { buffer: result.buffer, pending: result.pending, inject: "" };
  }

  if (
    !normalized.text &&
    options.physicalKey &&
    isGreekDeadPhysicalKey(options.physicalKey)
  ) {
    const result = applyGreekKeystroke(buffer, pending, "", options.physicalKey);
    return { buffer: result.buffer, pending: result.pending, inject: "" };
  }

  const output = resolveGreekSlotCharacter(
    translation,
    options.physicalKey,
    shift,
    options.fallbackOutput,
  );

  if (
    !output &&
    options.fallbackOutput &&
    isGreekDeadKeyPress(options.fallbackOutput, options.physicalKey)
  ) {
    return { buffer, pending, inject: "" };
  }

  if (!output) {
    return { buffer, pending, inject: "" };
  }

  if (isGreekDeadKeyPress(output, options.physicalKey)) {
    const result = applyGreekKeystroke(buffer, pending, "", options.physicalKey);
    return { buffer: result.buffer, pending: result.pending, inject: "" };
  }

  const result = applyGreekKeystroke(
    buffer,
    pending,
    output,
    options.physicalKey,
  );
  return {
    buffer: result.buffer,
    pending: result.pending,
    inject: result.buffer.slice(prevLen),
  };
}
