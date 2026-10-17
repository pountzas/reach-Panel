import type { CommandResult } from "./types";

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

/** Message from a soft `CommandResult`, or null when the command succeeded. */
export function commandFailure(result: CommandResult): string | null {
  if (result.success) {
    return null;
  }
  const message = result.error?.trim();
  return message && message.length > 0 ? message : "Command failed";
}
