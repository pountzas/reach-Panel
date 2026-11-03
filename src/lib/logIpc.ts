import type { CommandResult } from "./types";
import { logDebug, type LogFields } from "./log";

/**
 * Dev-only IPC failure logger. Use as `.catch(logIpc("cmd_foo"))` so fire-and-forget
 * invokes still leave a console trail instead of swallowing errors silently.
 */
export function logIpc(label: string) {
  return (error: unknown) => {
    if (import.meta.env.DEV) {
      console.warn(`[ipc] ${label}`, error);
    }
  };
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
  logDebug("layout-ipc", cmd, layoutIpcFields(args));
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
