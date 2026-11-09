export const AUTO_SEND_LOGS_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTO_SEND_LOGS_START_DELAY_MS = 15_000;
export const AUTO_SEND_LOGS_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const AUTO_SEND_LOGS_NOTE = "auto-weekly";

export type ShouldAutoSendInput = {
  enabled: boolean;
  configured: boolean;
  lastSuccessAt: string | null | undefined;
  lastAttemptAt: string | null | undefined;
  now: number;
};

export function shouldAutoSend({
  enabled,
  configured,
  lastSuccessAt,
  lastAttemptAt,
  now,
}: ShouldAutoSendInput): boolean {
  if (!enabled || !configured) {
    return false;
  }
  const lastAttemptMs = lastAttemptAt ? Date.parse(lastAttemptAt) : NaN;
  if (
    Number.isFinite(lastAttemptMs) &&
    lastAttemptMs <= now &&
    now - lastAttemptMs < AUTO_SEND_LOGS_CHECK_INTERVAL_MS
  ) {
    return false;
  }
  if (lastSuccessAt == null) {
    return true;
  }
  const lastSuccessMs = Date.parse(lastSuccessAt);
  if (Number.isNaN(lastSuccessMs) || lastSuccessMs > now) {
    return true;
  }
  return now - lastSuccessMs >= AUTO_SEND_LOGS_WEEK_MS;
}
