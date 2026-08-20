/** Pending dead-key accent on the virtual Greek keyboard (Windows EL layout). */
export type GreekPendingAccent = "tonos" | "dialytika" | "tonos_dialytika";

const TONOS_MARKS = new Set(["\u00B4", "\u0384", "\u1FFD"]);
const DIALYTIKA_MARKS = new Set(["\u00A8"]);

/** QWERTY physical keys that map to Greek dead accents when layout labels are empty. */
const TONOS_PHYSICAL_KEYS = new Set([";"]);
const DIALYTIKA_PHYSICAL_KEYS = new Set(["'"]);

export function isGreekDeadPhysicalKey(physicalKey?: string): boolean {
  if (!physicalKey) return false;
  const pk = physicalKey.toLowerCase();
  return TONOS_PHYSICAL_KEYS.has(pk) || DIALYTIKA_PHYSICAL_KEYS.has(pk);
}

const TONOS_ON: Record<string, string> = {
  "\u03B1": "\u03AC",
  "\u03B5": "\u03AD",
  "\u03B7": "\u03AE",
  "\u03B9": "\u03AF",
  "\u03BF": "\u03CC",
  "\u03C5": "\u03CD",
  "\u03C9": "\u03CE",
  "\u0391": "\u0386",
  "\u0395": "\u0388",
  "\u0397": "\u0389",
  "\u0399": "\u038A",
  "\u039F": "\u038C",
  "\u03A5": "\u038E",
  "\u03A9": "\u038F",
};

const DIALYTIKA_ON: Record<string, string> = {
  "\u03B9": "\u03CA",
  "\u03C5": "\u03CB",
  "\u0399": "\u03AA",
  "\u03A5": "\u03AB",
};

const TONOS_DIALYTIKA_ON: Record<string, string> = {
  "\u03B9": "\u0390",
  "\u03C5": "\u03B0",
  "\u0399": "\u0390",
  "\u03A5": "\u03B0",
};

function isGreekTonosMark(ch: string): boolean {
  return TONOS_MARKS.has(ch);
}

function isGreekDialytikaMark(ch: string): boolean {
  return DIALYTIKA_MARKS.has(ch);
}

export function isGreekDeadKeyPress(output: string, physicalKey?: string): boolean {
  return resolveGreekDeadAccent(output, physicalKey) !== null;
}

export function resolveGreekDeadAccent(
  output: string,
  physicalKey?: string,
): "tonos" | "dialytika" | null {
  if (output.length === 1) {
    if (isGreekTonosMark(output)) return "tonos";
    if (isGreekDialytikaMark(output)) return "dialytika";
  } else if (!output && physicalKey) {
    const pk = physicalKey.toLowerCase();
    if (TONOS_PHYSICAL_KEYS.has(pk)) return "tonos";
    if (DIALYTIKA_PHYSICAL_KEYS.has(pk)) return "dialytika";
  }
  return null;
}

function nextPendingAccent(
  pending: GreekPendingAccent | null,
  dead: "tonos" | "dialytika",
): GreekPendingAccent {
  if (dead === "tonos") {
    if (pending === "dialytika") return "tonos_dialytika";
    return "tonos";
  }
  if (pending === "tonos") return "tonos_dialytika";
  return "dialytika";
}

function composeWithPending(
  pending: GreekPendingAccent,
  ch: string,
): string | null {
  switch (pending) {
    case "tonos":
      return TONOS_ON[ch] ?? null;
    case "dialytika":
      return DIALYTIKA_ON[ch] ?? null;
    case "tonos_dialytika":
      return TONOS_DIALYTIKA_ON[ch] ?? null;
    default: {
      const _exhaustive: never = pending;
      return _exhaustive;
    }
  }
}

export function applyGreekKeystroke(
  buffer: string,
  pending: GreekPendingAccent | null,
  output: string,
  physicalKey?: string,
): { buffer: string; pending: GreekPendingAccent | null } {
  const dead = resolveGreekDeadAccent(output, physicalKey);
  if (dead) {
    return {
      buffer,
      pending: nextPendingAccent(pending, dead),
    };
  }

  if (!output || output.length !== 1 || /\s/u.test(output)) {
    return { buffer, pending };
  }

  if (pending) {
    const composed = composeWithPending(pending, output);
    return {
      buffer: buffer + (composed ?? output),
      pending: null,
    };
  }

  if (isGreekTonosMark(output) || isGreekDialytikaMark(output)) {
    return { buffer, pending };
  }

  return { buffer: buffer + output, pending: null };
}
