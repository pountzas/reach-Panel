const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS"]);

function normalizeKey(key: string): string | null {
  const lower = key.toLowerCase();
  if (lower === " ") return "space";
  if (lower === "escape") return "escape";
  if (lower === "enter") return "enter";
  if (lower.length === 1) return lower;
  if (lower.startsWith("f") && /^f\d{1,2}$/i.test(key)) return lower;
  return null;
}

/** Map a keyboard capture event to the host combo token list (Win+H style). */
export function pcMicShortcutFromKeyboardEvent(event: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.shiftKey) mods.push("shift");
  if (event.altKey) {
    if (event.location === KeyboardEvent.DOM_KEY_LOCATION_RIGHT) {
      mods.push("ralt");
    } else {
      mods.push("alt");
    }
  }
  if (event.metaKey) mods.push("win");
  if (MODIFIER_KEYS.has(event.key)) {
    return mods;
  }
  const key = normalizeKey(event.key);
  if (!key) return mods;
  return [...mods, key];
}
