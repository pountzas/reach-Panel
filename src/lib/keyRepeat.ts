/** Windows-like key-repeat timing for on-screen keys (press-and-hold). */
export const KEY_REPEAT_INITIAL_DELAY_MS = 500;
export const KEY_REPEAT_INTERVAL_MS = 33;

/**
 * Serial inject gate: discrete presses always queue; repeat ticks coalesce to
 * at most one pending after the current invocation finishes.
 */
export type SerialCoalesceGate = {
  /** Always run after prior work (discrete key presses). */
  enqueue: (fn: () => void | Promise<void>) => void;
  /** Coalesce while busy — keep only the latest pending repeat tick. */
  coalesce: (fn: () => void | Promise<void>) => void;
};

export const createSerialCoalesceGate = (): SerialCoalesceGate => {
  let chain: Promise<void> = Promise.resolve();
  let pendingRepeat: (() => void | Promise<void>) | null = null;
  let busy = false;

  const invoke = async (fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch {
      // Swallow so the chain continues (same as prior skip-gate behavior).
    }
  };

  const run = async (fn: () => void | Promise<void>) => {
    busy = true;
    try {
      await invoke(fn);
      // Drain coalesced repeat ticks before releasing busy so enqueue order
      // stays serial and pending work is not lost across microtask gaps.
      while (pendingRepeat) {
        const next = pendingRepeat;
        pendingRepeat = null;
        await invoke(next);
      }
    } finally {
      busy = false;
    }
  };

  return {
    enqueue(fn) {
      chain = chain.then(() => run(fn));
    },
    coalesce(fn) {
      if (busy) {
        pendingRepeat = fn;
        return;
      }
      chain = chain.then(() => run(fn));
    },
  };
};
