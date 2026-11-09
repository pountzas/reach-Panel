export const AUTO_SEND_LOGS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTO_SEND_LOGS_START_DELAY_MS = 15_000;
export const AUTO_SEND_LOGS_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const AUTO_SEND_LOGS_NOTE = "auto-weekly";

export type ShouldAutoSendInput = {
  enabled: boolean;
  configured: boolean;
  lastSuccessAt: string | null | undefined;
  now: number;
};

export function shouldAutoSend({
  enabled,
  configured,
  lastSuccessAt,
  now,
}: ShouldAutoSendInput): boolean {
  if (!enabled || !configured) {
    return false;
  }
  if (lastSuccessAt == null) {
    return true;
  }
  const lastSuccessMs = Date.parse(lastSuccessAt);
  if (Number.isNaN(lastSuccessMs)) {
    return false;
  }
  return now - lastSuccessMs >= AUTO_SEND_LOGS_WEEK_MS;
}
