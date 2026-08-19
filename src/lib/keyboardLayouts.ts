export interface KeyDef {
  label: string;
  key: string;
  width?: number;
  modifier?: boolean;
  shiftLabel?: string;
}

/** Symbol + word labels for common action keys (rendered in Keyboard). */
export const SPECIAL_KEY_LABELS: Record<
  string,
  { symbol: string; word: string; layout?: "stack" | "row" }
> = {
  backspace: { symbol: "⌫", word: "Backspace", layout: "stack" },
  enter: { symbol: "↵", word: "Enter", layout: "stack" },
  shift: { symbol: "⇧", word: "Shift", layout: "stack" },
  space: { symbol: "␣", word: "Space", layout: "row" },
};

export function isSpecialLabeledKey(key: string): boolean {
  return key in SPECIAL_KEY_LABELS;
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
  systemKlid: string;
  systemHkl: number;
  hasInputTarget: boolean;
}

export interface InputMethod {
  hkl: number;
  langTag: string;
  displayName: string;
  layoutName: string;
  klid: string;
}

export interface LayoutKeyLabel {
  key: string;
  label: string;
  shiftLabel?: string | null;
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
  systemKlid: "00000409",
  systemHkl: 0x0409,
  hasInputTarget: false,
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
  if (!keyDef || keyDef.key === "langswitch" || keyDef.key === "dictate") return null;
  return keyNameToVk(keyDef.key);
}

export const FN_KEY_MAP: Record<string, string> = {
  "1": "F1",
  "2": "F2",
  "3": "F3",
  "4": "F4",
  "5": "F5",
  "6": "F6",
  "7": "F7",
  "8": "F8",
  "9": "F9",
  "0": "F10",
  "-": "F11",
  "=": "F12",
};

export function isFnActive(stickyModifiers: string[]): boolean {
  return stickyModifiers.includes("fn");
}

export function isFnMappedKey(key: string): boolean {
  return key in FN_KEY_MAP;
}

function fnKeyVk(key: string): number | null {
  const fnKey = FN_KEY_MAP[key];
  if (!fnKey) return null;
  const num = Number.parseInt(fnKey.slice(1), 10);
  if (num < 1 || num > 24) return null;
  return 0x70 + num - 1;
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
    case "fn":
      return stickyModifiers.includes("fn");
    case "langswitch":
    case "dictate":
      return false;
    default: {
      const fnVk = fnKeyVk(keyDef.key);
      if (fnVk !== null && pressed.has(fnVk)) {
        return true;
      }
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
  locale = "en",
): string {
  if (!isLetterKey(key)) return key;
  const upper = capsLock !== shift;
  return upper
    ? key.toLocaleUpperCase(locale)
    : key.toLocaleLowerCase(locale);
}

export function resolveKeyOutput(
  keyDef: KeyDef,
  capsLock: boolean,
  shift: boolean,
  fnActive: boolean,
  locale = "en",
): string {
  if (keyDef.modifier || keyDef.key.length > 1) return keyDef.key;
  if (fnActive) {
    const fnKey = FN_KEY_MAP[keyDef.key];
    if (fnKey) return fnKey;
  }
  if (isLetterKey(keyDef.key)) {
    return resolveLetterCase(keyDef.key, capsLock, shift, locale);
  }
  if (shift && keyDef.shiftLabel) return keyDef.shiftLabel;
  return keyDef.key;
}

export function displayLabel(
  keyDef: KeyDef,
  capsLock: boolean,
  shift: boolean,
  fnActive: boolean,
  locale = "en",
): string {
  if (keyDef.modifier || keyDef.key.length > 1) return keyDef.label;
  if (fnActive) {
    const fnKey = FN_KEY_MAP[keyDef.key];
    if (fnKey) return fnKey;
  }
  if (isLetterKey(keyDef.key)) {
    return resolveLetterCase(keyDef.key, capsLock, shift, locale);
  }
  if (shift && keyDef.shiftLabel) return keyDef.shiftLabel;
  return keyDef.label;
}

export const QWERTY_ROWS: KeyDef[][] = [
  [
    { label: "`", key: "`", shiftLabel: "~" },
    { label: "1", key: "1", shiftLabel: "!" },
    { label: "2", key: "2", shiftLabel: "@" },
    { label: "3", key: "3", shiftLabel: "#" },
    { label: "4", key: "4", shiftLabel: "$" },
    { label: "5", key: "5", shiftLabel: "%" },
    { label: "6", key: "6", shiftLabel: "^" },
    { label: "7", key: "7", shiftLabel: "&" },
    { label: "8", key: "8", shiftLabel: "*" },
    { label: "9", key: "9", shiftLabel: "(" },
    { label: "0", key: "0", shiftLabel: ")" },
    { label: "-", key: "-", shiftLabel: "_" },
    { label: "=", key: "=", shiftLabel: "+" },
    { label: "⌫", key: "backspace", width: 1.5 },
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
    { label: "[", key: "[", shiftLabel: "{" },
    { label: "]", key: "]", shiftLabel: "}" },
    { label: "\\", key: "\\", shiftLabel: "|", width: 1.2 },
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
    { label: ";", key: ";", shiftLabel: ":" },
    { label: "'", key: "'", shiftLabel: '"' },
    { label: "↵", key: "enter", width: 1.7 },
  ],
  [
    { label: "⇧", key: "shift", width: 1.8, modifier: true },
    { label: "z", key: "z" },
    { label: "x", key: "x" },
    { label: "c", key: "c" },
    { label: "v", key: "v" },
    { label: "b", key: "b" },
    { label: "n", key: "n" },
    { label: "m", key: "m" },
    { label: ",", key: ",", shiftLabel: "<" },
    { label: ".", key: ".", shiftLabel: ">" },
    { label: "/", key: "/", shiftLabel: "?" },
    { label: "⇧", key: "shift", width: 1.8, modifier: true },
  ],
  [
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
    { label: "Win", key: "win", width: 1.2, modifier: true },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Lang", key: "langswitch", width: 1.2 },
    { label: "␣", key: "space", width: 3.0 },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Fn", key: "fn", width: 1.1, modifier: true },
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
    { label: "Mic", key: "dictate", width: 1.3 },
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
    { label: "⌫", key: "backspace", width: 1.5 },
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
    { label: "↵", key: "enter", width: 1.7 },
  ],
  [
    { label: "⇧", key: "shift", width: 1.8, modifier: true },
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
    { label: "⇧", key: "shift", width: 1.8, modifier: true },
  ],
  [
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
    { label: "Win", key: "win", width: 1.2, modifier: true },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Lang", key: "langswitch", width: 1.2 },
    { label: "␣", key: "space", width: 3.0 },
    { label: "Alt", key: "alt", width: 1.2, modifier: true },
    { label: "Fn", key: "fn", width: 1.1, modifier: true },
    { label: "Ctrl", key: "ctrl", width: 1.3, modifier: true },
    { label: "Mic", key: "dictate", width: 1.3 },
  ],
];

export const ONSCREEN_LAYOUT_OPTIONS = [
  "auto",
  "QWERTY",
  "QWERTZ",
  "AZERTY",
  "Greek",
] as const;

export type OnscreenLayoutOption = (typeof ONSCREEN_LAYOUT_OPTIONS)[number];

/** Resolve which OSK layout to paint (`auto` follows Windows). */
export function resolveOnscreenLayout(
  preference: string | undefined,
  windowsLayout: string,
  language: string,
): Exclude<OnscreenLayoutOption, "auto"> {
  if (
    preference &&
    preference !== "auto" &&
    (ONSCREEN_LAYOUT_OPTIONS as readonly string[]).includes(preference)
  ) {
    return preference as Exclude<OnscreenLayoutOption, "auto">;
  }
  if (windowsLayout === "QWERTZ" || windowsLayout === "AZERTY" || windowsLayout === "Greek") {
    return windowsLayout;
  }
  if (windowsLayout === "QWERTY") return "QWERTY";
  if (language === "el") return "Greek";
  if (language === "de") return "QWERTZ";
  if (language === "fr") return "AZERTY";
  return "QWERTY";
}

/** Apply ToUnicodeEx / layout-map labels onto the QWERTY physical key grid. */
export function applyLayoutKeyLabels(
  rows: KeyDef[][],
  labels: LayoutKeyLabel[],
): KeyDef[][] {
  if (!labels.length) return rows;
  const byKey = new Map(labels.map((l) => [l.key.toLowerCase(), l]));
  return rows.map((row) =>
    row.map((k) => {
      if (k.modifier || k.key.length > 1) return k;
      const mapped = byKey.get(k.key.toLowerCase());
      if (!mapped) return k;
      return {
        ...k,
        key: mapped.label,
        label: mapped.label,
        shiftLabel: mapped.shiftLabel ?? k.shiftLabel,
      };
    }),
  );
}

export function getLayoutRows(
  layoutName: string,
  language: string,
  layoutLabels?: LayoutKeyLabel[],
): KeyDef[][] {
  // Live Windows glyphs only when following the active system layout (auto mode).
  if (layoutLabels && layoutLabels.length > 0) {
    return applyLayoutKeyLabels(QWERTY_ROWS, layoutLabels);
  }
  if (layoutName === "Greek" || language === "el") return GREEK_ROWS;
  if (layoutName === "AZERTY") {
    return QWERTY_ROWS.map((row) =>
      row.map((k) => {
        const azertyMap: Record<string, string> = {
          q: "a",
          w: "z",
          a: "q",
          z: "w",
        };
        const mapped = azertyMap[k.key.toLowerCase()];
        return mapped ? { ...k, key: mapped, label: mapped } : k;
      }),
    );
  }
  if (layoutName === "QWERTZ") {
    return QWERTY_ROWS.map((row) =>
      row.map((k) => {
        const qwertzMap: Record<string, { label: string; shiftLabel?: string }> = {
          y: { label: "z" },
          z: { label: "y" },
          ";": { label: "ö" },
          "'": { label: "ä" },
          "[": { label: "ü" },
          "]": { label: "+" },
          "-": { label: "ß", shiftLabel: "?" },
          "/": { label: "-", shiftLabel: "_" },
        };
        const mapped = qwertzMap[k.key.toLowerCase()];
        if (!mapped) return k;
        return {
          ...k,
          key: mapped.label,
          label: mapped.label,
          shiftLabel: mapped.shiftLabel ?? k.shiftLabel,
        };
      }),
    );
  }
  return QWERTY_ROWS;
}

/** ISO language tag → svg-flags country code for the Lang key. */
export function flagCodeForLanguage(langTag: string): string {
  const primary = langTag.toLowerCase().split("-")[0] ?? "en";
  const map: Record<string, string> = {
    en: "gb",
    el: "gr",
    de: "de",
    fr: "fr",
    es: "es",
    it: "it",
    pt: "pt",
    ru: "ru",
    tr: "tr",
    pl: "pl",
    nl: "nl",
    ja: "jp",
    zh: "cn",
    ko: "kr",
    ar: "sa",
    hu: "hu",
    cs: "cz",
    sk: "sk",
    hr: "hr",
    ro: "ro",
    uk: "ua",
    fi: "fi",
    sv: "se",
    no: "no",
    da: "dk",
  };
  return map[primary] ?? "gb";
}

export function languageDisplayCode(langTag: string): string {
  return (langTag.split("-")[0] ?? langTag).toUpperCase();
}
