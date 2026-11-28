import { physicalKeyFromKeyboardCode } from "./layoutKeyTranslation";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS"]);

const CODE_TO_TOKEN: Record<string, string> = {
  Space: "space",
  Enter: "enter",
  Escape: "escape",
  Backspace: "backspace",
  Tab: "tab",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  CapsLock: "capslock",
};

function tokenFromCode(code: string): string | null {
  const mapped = CODE_TO_TOKEN[code];
  if (mapped) return mapped;
  const physical = physicalKeyFromKeyboardCode(code);
  if (physical) return physical;
  if (/^F\d{1,2}$/i.test(code)) return code.toLowerCase();
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
  const key = tokenFromCode(event.code);
  if (!key) return mods;
  return [...mods, key];
}
