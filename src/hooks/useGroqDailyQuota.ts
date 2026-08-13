import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  localDateKey,
  msUntilNextLocalMidnight,
  percentFromStoredQuota,
  remainingPercent,
  writeStoredQuota,
  type GroqQuotaEventPayload,
} from "../lib/groqDailyQuota";

/** Remaining Groq RPD % for today, or null when the badge should be hidden. */
export function useGroqDailyQuota(
  engine: string | null | undefined,
): number | null {
  const [percent, setPercent] = useState<number | null>(() =>
    percentFromStoredQuota(engine),
  );

  useEffect(() => {
    setPercent(percentFromStoredQuota(engine));
  }, [engine]);

  useEffect(() => {
    if (engine !== "groq") return;

    let cancelled = false;
    const unlistenPromise = listen<GroqQuotaEventPayload>(
      "stt-groq-quota",
      (event) => {
        const today = localDateKey();
        const snapshot = {
          date: today,
          remainingRequests: event.payload.remainingRequests,
          limitRequests: event.payload.limitRequests,
        };
        writeStoredQuota(snapshot);
        if (!cancelled) {
          setPercent(
            remainingPercent(
              snapshot.remainingRequests,
              snapshot.limitRequests,
            ),
          );
        }
      },
    );

    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [engine]);

  useEffect(() => {
    if (engine !== "groq") return;

    const refresh = () => setPercent(percentFromStoredQuota(engine));

    let timeoutId = 0;
    const scheduleMidnightRefresh = () => {
      timeoutId = window.setTimeout(() => {
        refresh();
        scheduleMidnightRefresh();
      }, msUntilNextLocalMidnight());
    };
    scheduleMidnightRefresh();

    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [engine]);

  return percent;
}
