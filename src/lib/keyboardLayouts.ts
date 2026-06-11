export interface KeyDef {
  label: string;
  key: string;
  width?: number;
  modifier?: boolean;
}

export interface PhysicalKeyState {
  capsLock: boolean;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  win: boolean;
  pressedVks: number[];
  systemLanguage: string;
  keyboardLayout: string;
}

export const DEFAULT_PHYSICAL_KEY_STATE: PhysicalKeyState = {
  capsLock: false,
  shift: false,
  ctrl: false,
  alt: false,
  win: false,
  pressedVks: [],
  systemLanguage: "en",
  keyboardLayout: "QWERTY",
};

const SPECIAL_VK: Record<string, number> = {
  backspace: 0x08,
  tab: 0x09,
  enter: 0x0d,
  shift: 0x10,
  ctrl: 0x11,
  alt: 0x12,
  capslock: 0x14,
  space: 0x20,
  win: 0x5b,
  "`": 0xc0,
  "-": 0xbd,
  "=": 0xbb,
  "[": 0xdb,
  "]": 0xdd,
  "\\": 0xdc,
  ";": 0xba,
  "'": 0xde,
  ",": 0xbc,
  ".": 0xbe,
  "/": 0xbf,
};

function keyNameToVk(key: string): number | null {
  if (key in SPECIAL_VK) return SPECIAL_VK[key];
  if (/^[a-z]$/.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  return null;
}

/** Maps a layout key to its physical Windows VK using QWERTY key positions. */
export function vkForLayoutKey(row: number, col: number): number | null {
  const keyDef = QWERTY_ROWS[row]?.[col];
  if (!keyDef || keyDef.key === "langswitch") return null;
  return keyNameToVk(keyDef.key);
}

export function isKeyActive(
  keyDef: KeyDef,
  row: number,
  col: number,
  physical: PhysicalKeyState,
  stickyModifiers: string[],
): boolean {
  const pressed = new Set(physical.pressedVks);
  switch (keyDef.key) {
    case "capslock":
      return physical.capsLock;
    case "shift":
      return physical.shift || stickyModifiers.includes("shift");
    case "ctrl":
      return physical.ctrl || stickyModifiers.includes("ctrl");
    case "alt":
      return physical.alt || stickyModifiers.includes("alt");
    case "win":
      return physical.win || stickyModifiers.includes("win");
    case "langswitch":
      return false;
    default: {
      const vk = vkForLayoutKey(row, col);
      return vk !== null && pressed.has(vk);
    }
  }
}

export function isShiftActive(
  physical: PhysicalKeyState,
  stickyModifiers: string[],
): boolean {
  return physical.shift || stickyModifiers.includes("shift");
}

const LETTER_RE = /^[\p{L}]$/u;

export function isLetterKey(key: string): boolean {
  return LETTER_RE.test(key);
}

/** Caps and shift XOR — matches physical keyboard behavior. */
export function resolveLetterCase(
  key: string,
  capsLock: boolean,
  shift: boolean,
): string {
  if (!isLetterKey(key)) return key;
  const upper = capsLock !== shift;
  return upper ? key.toLocaleUpperCase("el") : key.toLocaleLowerCase("el");
}

export function displayLabel(
  keyDef: KeyDef,
  capsLock: boolean,
  shift: boolean,
): string {
  if (keyDef.modifier || keyDef.key.length > 1) return keyDef.label;
  if (isLetterKey(keyDef.key)) {
    return resolveLetterCase(keyDef.key, capsLock, shift);
  }
  return keyDef.label;
}

export const QWERTY_ROWS: KeyDef[][] = [
  [
    { label: "`", key: "`" },
    { label: "1", key: "1" },
    { label: "2", key: "2" },
    { label: "3", key: "3" },
    { label: "4", key: "4" },
    { label: "5", key: "5" },
    { label: "6", key: "6" },
    { label: "7", key: "7" },
    { label: "8", key: "8" },
    { label: "9", key: "9" },
    { label: "0", key: "0" },
    { label: "-", key: "-" },
    { label: "=", key: "=" },
    { label: "Back", key: "backspace", width: 1.5 },
  ],
  [
    { label: "Tab", key: "tab", width: 1.3 },
    { label: "q", key: "q" },
    { label: "w", key: "w" },
    { label: "e", key: "e" },
    { label: "r", key: "r" },
    { label: "t", key: "t" },
    { label: "y", key: "y" },
    { label: "u", key: "u" },
    { label: "i", key: "i" },
    { label: "o", key: "o" },
    { label: "p", key: "p" },
    { label: "[", key: "[" },
    { label: "]", key: "]" },
    { label: "\\", key: "\\", width: 1.2 },
  ],
  [
    { label: "Caps", key: "capslock", width: 1.5, modifier: true },
    { label: "a", key: "a" },
    { label: "s", key: "s" },
    { label: "d", key: "d" },
    { label: "f", key: "f" },
    { label: "g", key: "g" },
    { label: "h", key: "h" },
    { label: "j", key: "j" },
    { label: "k", key: "k" },
    { label: "l", key: "l" },
    { label: ";", key: ";" },
    { label: "'", key: "'" },
    { label: "Enter", key: "enter", width: 1.7 },
  ],
  [
    { label: "Shift", key: "shift", width: 1.8, modifier: true },
    { label: "z", key: "z" },
    { label: "x", key: "x" },
    { label: "c", key: "c" },
    { label: "v", key: "v" },
    { label: "b", key: "b" },
    { label: "n", key: "n" },
    { label: "m", key: "m" },
    { label: ",", key: "," },
    { label: ".", key: "." },
    { label: "/", key: "/" },
    { label: "Shift", key: "shift", width: 1.8, modifier: true },
  ],
  [
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
    { label: "Win", key: "win", width: 1.2, modifier: true },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Lang", key: "langswitch", width: 1.2 },
    { label: "Space", key: "space", width: 4.2 },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
  ],
];

/** Standard Windows Greek (EL) layout — keys are the characters sent to the target app. */
export const GREEK_ROWS: KeyDef[][] = [
  [
    { label: ";", key: ";" },
    { label: "1", key: "1" },
    { label: "2", key: "2" },
    { label: "3", key: "3" },
    { label: "4", key: "4" },
    { label: "5", key: "5" },
    { label: "6", key: "6" },
    { label: "7", key: "7" },
    { label: "8", key: "8" },
    { label: "9", key: "9" },
    { label: "0", key: "0" },
    { label: "-", key: "-" },
    { label: "=", key: "=" },
    { label: "Back", key: "backspace", width: 1.5 },
  ],
  [
    { label: "Tab", key: "tab", width: 1.3 },
    { label: ";", key: ";" },
    { label: "ς", key: "ς" },
    { label: "ε", key: "ε" },
    { label: "ρ", key: "ρ" },
    { label: "τ", key: "τ" },
    { label: "υ", key: "υ" },
    { label: "θ", key: "θ" },
    { label: "ι", key: "ι" },
    { label: "ο", key: "ο" },
    { label: "π", key: "π" },
    { label: "[", key: "[" },
    { label: "]", key: "]" },
    { label: "\\", key: "\\", width: 1.2 },
  ],
  [
    { label: "Caps", key: "capslock", width: 1.5, modifier: true },
    { label: "α", key: "α" },
    { label: "σ", key: "σ" },
    { label: "δ", key: "δ" },
    { label: "φ", key: "φ" },
    { label: "γ", key: "γ" },
    { label: "η", key: "η" },
    { label: "ξ", key: "ξ" },
    { label: "κ", key: "κ" },
    { label: "λ", key: "λ" },
    { label: "´", key: "´" },
    { label: "'", key: "'" },
    { label: "Enter", key: "enter", width: 1.7 },
  ],
  [
    { label: "Shift", key: "shift", width: 1.8, modifier: true },
    { label: "\\", key: "\\" },
    { label: "ζ", key: "ζ" },
    { label: "χ", key: "χ" },
    { label: "ψ", key: "ψ" },
    { label: "ω", key: "ω" },
    { label: "β", key: "β" },
    { label: "ν", key: "ν" },
    { label: "μ", key: "μ" },
    { label: ",", key: "," },
    { label: ".", key: "." },
    { label: "/", key: "/" },
    { label: "Shift", key: "shift", width: 1.8, modifier: true },
  ],
  [
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
    { label: "Win", key: "win", width: 1.2, modifier: true },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Lang", key: "langswitch", width: 1.2 },
    { label: "Space", key: "space", width: 4.2 },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
  ],
];

export const LANGUAGE_OPTIONS = ["en", "el"] as const;
export type KeyboardLanguage = (typeof LANGUAGE_OPTIONS)[number];

export function nextLanguage(current: string): KeyboardLanguage {
  const idx = LANGUAGE_OPTIONS.indexOf(current as KeyboardLanguage);
  return LANGUAGE_OPTIONS[(idx + 1) % LANGUAGE_OPTIONS.length];
}

export function languageSwitchLabel(current: string): string {
  return nextLanguage(current) === "el" ? "EL" : "EN";
}

export function getLayoutRows(layoutName: string, language: string): KeyDef[][] {
  if (language === "el") return GREEK_ROWS;
  if (layoutName === "AZERTY") {
    return QWERTY_ROWS.map((row) =>
      row.map((k) => {
        const azertyMap: Record<string, string> = {
          q: "a", w: "z", a: "q", z: "w",
        };
        const mapped = azertyMap[k.key.toLowerCase()];
        return mapped ? { ...k, key: mapped, label: mapped } : k;
      }),
    );
  }
  return QWERTY_ROWS;
}
