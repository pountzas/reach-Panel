import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startAutoSendLogsScheduler,
  type AutoSendLogsSchedulerDeps,
} from "./autoSendLogsScheduler";

const START_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-09T00:00:00.000Z");
const SEND_ARGS = {
  cmd: "cmd_send_diagnostics",
  args: { send: true, note: "auto-weekly" },
} as const;

type InvokeCall = { cmd: string; args?: Record<string, unknown> };

function dueDeps(
  overrides: Partial<AutoSendLogsSchedulerDeps> = {},
): AutoSendLogsSchedulerDeps {
  return {
    isEnabled: () => true,
    isConfigured: () => true,
    getLastSuccessAt: () => null,
    now: () => NOW,
    invoke: async () => undefined,
    onSuccess: () => {},
    log: { warn: () => {} },
    ...overrides,
  };
}

describe("startAutoSendLogsScheduler", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it("invokes cmd_send_diagnostics after the 15s start delay when a send is due", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS - 1);
    expect(invokes).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(invokes).toEqual([SEND_ARGS]);
  });

  it("does not invoke when auto-send is disabled", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        isEnabled: () => false,
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([]);
  });

  it("does not invoke when upload is unconfigured", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        isConfigured: () => false,
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([]);
  });

  it("calls onSuccess with now() as ISO only after invoke resolves", async () => {
    let resolveInvoke!: () => void;
    const successes: string[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        now: () => Date.parse("2026-11-09T00:00:15.000Z"),
        invoke: () =>
          new Promise((resolve) => {
            resolveInvoke = () => {
              resolve(undefined);
            };
          }),
        onSuccess: (iso) => {
          successes.push(iso);
        },
      }),
    );

    vi.advanceTimersByTime(START_DELAY_MS);
    await Promise.resolve();
    expect(successes).toEqual([]);

    resolveInvoke();
    await Promise.resolve();
    expect(successes).toEqual(["2026-11-09T00:00:15.000Z"]);
  });

  it("checks again 6 hours after the start delay when still due", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([SEND_ARGS]);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
    expect(invokes).toEqual([SEND_ARGS]);

    await vi.advanceTimersByTimeAsync(1);
    expect(invokes).toEqual([SEND_ARGS, SEND_ARGS]);
  });

  it("does not invoke again while the first send is still pending", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: (cmd, args) => {
          invokes.push({ cmd, args });
          return new Promise(() => {});
        },
      }),
    );

    vi.advanceTimersByTime(START_DELAY_MS);
    await Promise.resolve();
    expect(invokes).toEqual([SEND_ARGS]);

    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    await Promise.resolve();
    expect(invokes).toEqual([SEND_ARGS]);
  });

  it("logs sendLogsFailed on other errors and retries at the next 6h check", async () => {
    const invokes: InvokeCall[] = [];
    const successes: string[] = [];
    const warnings: string[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
          throw new Error("cmd_send_diagnostics failed");
        },
        onSuccess: (iso) => {
          successes.push(iso);
        },
        log: {
          warn: (message) => {
            warnings.push(message);
          },
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([SEND_ARGS]);
    expect(successes).toEqual([]);
    expect(warnings).toEqual(["sendLogsFailed"]);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
    expect(invokes).toEqual([SEND_ARGS]);

    await vi.advanceTimersByTimeAsync(1);
    expect(invokes).toEqual([SEND_ARGS, SEND_ARGS]);
    expect(successes).toEqual([]);
    expect(warnings).toEqual(["sendLogsFailed", "sendLogsFailed"]);
  });

  it("logs sendLogsFailedRateLimited on http_429 and waits for the next 6h check", async () => {
    const invokes: InvokeCall[] = [];
    const successes: string[] = [];
    const warnings: string[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
          throw new Error("upload rejected http_429");
        },
        onSuccess: (iso) => {
          successes.push(iso);
        },
        log: {
          warn: (message) => {
            warnings.push(message);
          },
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([SEND_ARGS]);
    expect(successes).toEqual([]);
    expect(warnings).toEqual(["sendLogsFailedRateLimited"]);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
    expect(invokes).toEqual([SEND_ARGS]);

    await vi.advanceTimersByTimeAsync(1);
    expect(invokes).toEqual([SEND_ARGS, SEND_ARGS]);
    expect(successes).toEqual([]);
  });

  it("does not invoke after stop() is called before the start delay", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    stop();
    stop = undefined;
    await vi.advanceTimersByTimeAsync(START_DELAY_MS + CHECK_INTERVAL_MS);
    expect(invokes).toEqual([]);
  });

  it("does not invoke on the next interval after stop()", async () => {
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([SEND_ARGS]);

    stop();
    stop = undefined;
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(invokes).toEqual([SEND_ARGS]);
  });

  it("sees an enable that happens after start and before the next check", async () => {
    let enabled = false;
    const invokes: InvokeCall[] = [];
    stop = startAutoSendLogsScheduler(
      dueDeps({
        isEnabled: () => enabled,
        invoke: async (cmd, args) => {
          invokes.push({ cmd, args });
        },
      }),
    );

    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(invokes).toEqual([]);

    enabled = true;
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(invokes).toEqual([SEND_ARGS]);
  });
});
