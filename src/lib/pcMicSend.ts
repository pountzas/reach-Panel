import type { AppSettings, PcMicSendMode } from "./types";

export const DEFAULT_PC_MIC_SEND_MODE: PcMicSendMode = "winH";

export const DEFAULT_PC_MIC_CUSTOM_KEYS = ["win", "h"] as const;

export function pcMicHoldEnabled(
  settings: Pick<AppSettings, "pcMicSendMode">,
): boolean {
  return (
    (settings.pcMicSendMode ?? DEFAULT_PC_MIC_SEND_MODE) === "rightAltHold"
  );
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
