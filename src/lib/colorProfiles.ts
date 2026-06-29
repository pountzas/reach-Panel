export const COLOR_PROFILE_IDS = ["light-grey", "dark-grey", "custom"] as const;

export type ColorProfileId = (typeof COLOR_PROFILE_IDS)[number];

/** Color fields driven by a color profile preset. */
export interface ColorProfileColors {
  appBgColor: string;
  headerBgColor: string;
  headerTextColor: string;
  keyboardBgColor: string;
  keyboardKeyColor: string;
  keyTextColor: string;
  mousePanelBgColor: string;
}

export const COLOR_PROFILE_PRESETS: Record<
  Exclude<ColorProfileId, "custom">,
  ColorProfileColors
> = {
  "light-grey": {
    appBgColor: "#e5e7eb",
    headerBgColor: "#6b7280",
    headerTextColor: "#ffffff",
    keyboardBgColor: "#d1d5db",
    keyboardKeyColor: "#f3f4f6",
    keyTextColor: "#374151",
    mousePanelBgColor: "#e5e7eb",
  },
  "dark-grey": {
    appBgColor: "#374151",
    headerBgColor: "#1f2937",
    headerTextColor: "#f3f4f6",
    keyboardBgColor: "#4b5563",
    keyboardKeyColor: "#6b7280",
    keyTextColor: "#f9fafb",
    mousePanelBgColor: "#374151",
  },
};

export function isPresetProfile(
  id: ColorProfileId,
): id is Exclude<ColorProfileId, "custom"> {
  return id !== "custom";
}

/** Returns the color partial for a preset, or empty for custom. */
export function getColorProfileColors(
  id: ColorProfileId,
): Partial<ColorProfileColors> {
  return isPresetProfile(id) ? COLOR_PROFILE_PRESETS[id] : {};
}

function normalizeHex(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when every preset color field matches the provided colors. */
export function colorsMatchPreset(
  colors: Partial<ColorProfileColors>,
  presetId: Exclude<ColorProfileId, "custom">,
): boolean {
  const preset = COLOR_PROFILE_PRESETS[presetId];
  return (Object.keys(preset) as (keyof ColorProfileColors)[]).every(
    (key) => normalizeHex(colors[key]) === normalizeHex(preset[key]),
  );
}

/**
 * Resolves the effective color profile for a settings object that may predate
 * the `colorProfile` field. Detects matching presets, otherwise falls back to
 * "custom" so existing user colors are preserved.
 */
export function resolveColorProfile(settings: {
  colorProfile?: unknown;
  theme?: unknown;
} & Partial<ColorProfileColors>): ColorProfileId {
  const candidate = settings.colorProfile;
  if (typeof candidate === "string" && COLOR_PROFILE_IDS.includes(candidate as ColorProfileId)) {
    return candidate as ColorProfileId;
  }

  if (colorsMatchPreset(settings, "light-grey")) return "light-grey";
  if (colorsMatchPreset(settings, "dark-grey")) return "dark-grey";

  if (settings.theme === "dark") return "dark-grey";

  return "custom";
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex).replace("#", "");
  if (normalized.length !== 6) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((c) => clampChannel(c).toString(16).padStart(2, "0"))
    .join("")}`;
}

function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount));
}

function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}

/** Perceptual luminance in the 0 (black) to 1 (white) range. */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

export interface SynthBlackKeyColors {
  base: string;
  pressed: string;
}

/**
 * Derives synthesizer black-key colors so they stay consistent with the active
 * color profile. Presets use fixed dark values; custom mode derives from the
 * key text color.
 */
export function getSynthBlackKeyColors(
  profile: ColorProfileId,
  keyTextColor: string | undefined,
): SynthBlackKeyColors {
  switch (profile) {
    case "light-grey":
      return { base: "#1e293b", pressed: "#0f172a" };
    case "dark-grey":
      return { base: "#374151", pressed: "#1f2937" };
    case "custom": {
      const base = keyTextColor ?? "#1e293b";
      return { base, pressed: darkenHex(base, 0.25) };
    }
  }
}

/** Colors for generic panel/card surfaces (phrases, quick actions, section frames). */
export interface SurfaceColors {
  panelBg: string;
  panelHeaderBg: string;
  panelBorder: string;
  panelText: string;
  panelMutedText: string;
  panelButtonBg: string;
  /** Recessed "well" surface, e.g. the trackpad drag area. */
  insetBg: string;
  insetBorder: string;
  insetText: string;
}

/**
 * Derives harmonizing surface colors from the app background so panels and
 * section frames follow the active color profile (including custom colors)
 * instead of staying a fixed white.
 */
export function getSurfaceColors(appBgColor: string | undefined): SurfaceColors {
  const base = appBgColor ?? "#e5e7eb";
  const isDark = relativeLuminance(base) < 0.5;

  if (isDark) {
    return {
      panelBg: lightenHex(base, 0.1),
      panelHeaderBg: lightenHex(base, 0.18),
      panelBorder: lightenHex(base, 0.28),
      panelText: "#f9fafb",
      panelMutedText: "#d1d5db",
      panelButtonBg: lightenHex(base, 0.22),
      insetBg: darkenHex(base, 0.22),
      insetBorder: lightenHex(base, 0.28),
      insetText: "#d1d5db",
    };
  }

  return {
    panelBg: lightenHex(base, 0.6),
    panelHeaderBg: darkenHex(base, 0.05),
    panelBorder: darkenHex(base, 0.14),
    panelText: "#374151",
    panelMutedText: "#6b7280",
    panelButtonBg: lightenHex(base, 0.35),
    insetBg: darkenHex(base, 0.06),
    insetBorder: darkenHex(base, 0.2),
    insetText: "#64748b",
  };
}
