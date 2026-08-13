/** sessionStorage key for last Groq RPD snapshot (local calendar day). */
export const GROQ_DAILY_QUOTA_STORAGE_KEY = "reachpanel.groqDailyQuota.v1";

export type GroqDailyQuotaSnapshot = {
  date: string;
  remainingRequests: number;
  limitRequests: number;
};

export type GroqQuotaEventPayload = {
  remainingRequests: number;
  limitRequests: number;
};

/** Milliseconds until the next local calendar midnight (minimum 1ms). */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1, nextMidnight.getTime() - now.getTime());
}

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Remaining requests-per-day percent, rounded and clamped to 0–100. */
export function remainingPercent(remaining: number, limit: number): number {
  if (!Number.isFinite(remaining) || !Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((100 * remaining) / limit)));
}

/** Badge only after first Groq use today; never for WinRT. */
export function shouldShowQuotaBadge(
  snapshot: GroqDailyQuotaSnapshot | null,
  today: string,
  engine: string | null | undefined,
): boolean {
  if (engine !== "groq") return false;
  if (!snapshot) return false;
  return snapshot.date === today;
}

export function readStoredQuota(
  storage: Pick<Storage, "getItem"> = sessionStorage,
): GroqDailyQuotaSnapshot | null {
  try {
    const raw = storage.getItem(GROQ_DAILY_QUOTA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GroqDailyQuotaSnapshot>;
    if (
      typeof parsed.date !== "string" ||
      typeof parsed.remainingRequests !== "number" ||
      typeof parsed.limitRequests !== "number"
    ) {
      return null;
    }
    return {
      date: parsed.date,
      remainingRequests: parsed.remainingRequests,
      limitRequests: parsed.limitRequests,
    };
  } catch {
    return null;
  }
}

export function writeStoredQuota(
  snapshot: GroqDailyQuotaSnapshot,
  storage: Pick<Storage, "setItem"> = sessionStorage,
): void {
  storage.setItem(GROQ_DAILY_QUOTA_STORAGE_KEY, JSON.stringify(snapshot));
}

export function percentFromStoredQuota(
  engine: string | null | undefined,
  today: string = localDateKey(),
  storage: Pick<Storage, "getItem"> = sessionStorage,
): number | null {
  const snapshot = readStoredQuota(storage);
  if (!shouldShowQuotaBadge(snapshot, today, engine)) return null;
  return remainingPercent(snapshot!.remainingRequests, snapshot!.limitRequests);
}
