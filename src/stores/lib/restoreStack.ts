import type {
  HostAppMode,
  WindowHeightRatioBeforeTeaching,
} from "../../lib/appModeLayout";

export type RestoreReason =
  | "teaching"
  | "companion"
  | "widePiano"
  | "focusMode";

export type RestorePatch = {
  mode?: HostAppMode;
  windowHeightRatio?: WindowHeightRatioBeforeTeaching;
  mouseVisible?: boolean;
};

export type RestoreStackEntry = {
  reason: RestoreReason;
  patch: RestorePatch;
};

/** Append a restore frame. No-op when `reason` is already on the stack. */
export function pushRestoreEntry(
  stack: RestoreStackEntry[],
  reason: RestoreReason,
  patch: RestorePatch,
): RestoreStackEntry[] {
  if (stack.some((entry) => entry.reason === reason)) {
    return stack;
  }
  return [...stack, { reason, patch }];
}

/** Remove the most recent frame with `reason` and return its patch. */
export function popRestoreEntry(
  stack: RestoreStackEntry[],
  reason: RestoreReason,
): { stack: RestoreStackEntry[]; patch: RestorePatch | null } {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.reason === reason) {
      return {
        stack: [...stack.slice(0, i), ...stack.slice(i + 1)],
        patch: stack[i]!.patch,
      };
    }
  }
  return { stack, patch: null };
}

/** Read the most recent frame with `reason` without mutating. */
export function peekRestore(
  stack: RestoreStackEntry[],
  reason: RestoreReason,
): RestorePatch | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.reason === reason) {
      return stack[i]!.patch;
    }
  }
  return null;
}

/** Teaching close restores Normal / Focus / Mic only. */
export function peekTeachingRestoreMode(
  stack: RestoreStackEntry[],
): "normal" | "focus" | "mic" | null {
  const mode = peekRestore(stack, "teaching")?.mode;
  if (mode === "normal" || mode === "focus" || mode === "mic") {
    return mode;
  }
  return null;
}
