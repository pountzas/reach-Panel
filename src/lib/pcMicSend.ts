import type { PcMicSendMode } from "./types";

export const DEFAULT_PC_MIC_SEND_MODE: PcMicSendMode = "winH";

export const DEFAULT_PC_MIC_CUSTOM_KEYS = ["win", "h"] as const;

/** Migrate persisted `rightAltHold` to one-shot `rightAlt`. */
export function normalizePcMicSendMode(
  mode: string | undefined,
): PcMicSendMode | undefined {
  if (mode === "rightAltHold") return "rightAlt";
  if (mode === "winH" || mode === "rightAlt" || mode === "custom") return mode;
  return undefined;
}

export function formatPcMicCombo(keys: string[]): string {
  return keys
    .map((k) => {
      if (k === "ralt") return "Right Alt";
      if (k === "win") return "Win";
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join(" + ");
}
