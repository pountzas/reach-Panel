/** Windows-like key-repeat timing for on-screen keys (press-and-hold). */
export const KEY_REPEAT_INITIAL_DELAY_MS = 500;
export const KEY_REPEAT_INTERVAL_MS = 33;

/**
 * Skip-while-in-flight gate for async key injects under hold-to-repeat.
 * If a prior call is still pending, later ticks are dropped (coalesce depth 0 pending).
 */
export type SkipWhileInFlight = {
  run: (fn: () => void | Promise<void>) => void;
  isInFlight: () => boolean;
};

export function createSkipWhileInFlight(): SkipWhileInFlight {
  let inFlight = false;
  return {
    run(fn) {
      if (inFlight) return;
      inFlight = true;
      let result: void | Promise<void>;
      try {
        result = fn();
      } catch {
        inFlight = false;
        return;
      }
      if (result != null && typeof (result as PromiseLike<void>).then === "function") {
        void Promise.resolve(result).then(
          () => {
            inFlight = false;
          },
          () => {
            inFlight = false;
          },
        );
        return;
      }
      inFlight = false;
    },
    isInFlight: () => inFlight,
  };
}
