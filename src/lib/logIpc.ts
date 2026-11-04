import { invoke } from "@tauri-apps/api/core";
import type { CommandResult } from "./types";
import { logWarn, type LogFields } from "./log";

const RATE_LIMIT_MS = 1000;

const lastLoggedAt = new Map<string, number>();
const suppressedCount = new Map<string, number>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Fire-and-forget IPC failure logger. DEV still prints to the console; every
 * build also writes a rate-limited `logWarn` (at most one line per second per
 * label, plus a suppressed-count summary).
 */
export function logIpc(label: string) {
  return (error: unknown) => {
    if (import.meta.env.DEV) {
      console.warn(`[ipc] ${label}`, error);
    }
    logIpcFailure(label, error);
  };
}

function flushSuppressed(label: string): void {
  const timer = flushTimers.get(label);
  if (timer !== undefined) {
    clearTimeout(timer);
    flushTimers.delete(label);
  }
  const suppressed = suppressedCount.get(label) ?? 0;
  if (suppressed > 0) {
    logWarn("ipc", label, { suppressed });
    suppressedCount.set(label, 0);
  }
}

function logIpcFailure(label: string, error: unknown): void {
  const now = Date.now();
  const last = lastLoggedAt.get(label) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    suppressedCount.set(label, (suppressedCount.get(label) ?? 0) + 1);
    if (!flushTimers.has(label)) {
      flushTimers.set(
        label,
        setTimeout(
          () => {
            flushTimers.delete(label);
            flushSuppressed(label);
          },
          RATE_LIMIT_MS - (now - last),
        ),
      );
    }
    return;
  }
  flushSuppressed(label);
  logWarn("ipc", label, { error });
  lastLoggedAt.set(label, now);
}

const LAYOUT_IPC_MIN_INTERVAL_MS = 1000;
let lastLayoutIpcAt = 0;

function layoutIpcFields(args: unknown): LogFields {
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    const fields: LogFields = {};
    for (const [key, value] of Object.entries(args)) {
      fields[key] = value;
    }
    return fields;
  }
  return { args };
}

/** Layout IPC at debug in all builds, rate-limited so a grip drag cannot flood the log. */
export function logLayoutIpc(
  cmd: "cmd_apply_window_layout" | "cmd_animate_window_layout",
  args: unknown,
): void {
  if (import.meta.env.DEV) {
    console.debug("[layout-ipc]", cmd, args);
  }
  const now = Date.now();
  if (now - lastLayoutIpcAt < LAYOUT_IPC_MIN_INTERVAL_MS) {
    return;
  }
  lastLayoutIpcAt = now;
  void Promise.resolve(
    invoke("cmd_record_breadcrumb", {
      scope: "layout-ipc",
      message: `${cmd} ${JSON.stringify(layoutIpcFields(args))}`,
    }),
  ).catch(() => {});
}

export function resetLayoutIpcRateLimit(): void {
  lastLayoutIpcAt = 0;
}

/** Message from a soft `CommandResult`, or null when the command succeeded. */
export function commandFailure(result: CommandResult): string | null {
  if (result.success) {
    return null;
  }
  const message = result.error?.trim();
  return message && message.length > 0 ? message : "Command failed";
}
