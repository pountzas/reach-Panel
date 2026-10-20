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

/** Dev-only: log window-layout IPC args (used to confirm #299 height jumps). */
export function logLayoutIpc(
  cmd: "cmd_apply_window_layout" | "cmd_animate_window_layout",
  args: unknown,
): void {
  if (import.meta.env.DEV) {
    console.debug("[layout-ipc]", cmd, args);
  }
}

/** Message from a soft `CommandResult`, or null when the command succeeded. */
export function commandFailure(result: CommandResult): string | null {
  if (result.success) {
    return null;
  }
  const message = result.error?.trim();
  return message && message.length > 0 ? message : "Command failed";
}
