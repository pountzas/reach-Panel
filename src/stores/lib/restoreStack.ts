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

/**
 * Append a restore frame. When `reason` is already on the stack the existing
 * frame is kept, unless `options.replace` is set: then it is replaced and moved
 * to the top (use this at mode entry points, which used to overwrite).
 */
export function pushRestoreEntry(
  stack: RestoreStackEntry[],
  reason: RestoreReason,
  patch: RestorePatch,
  options?: { replace?: boolean },
): RestoreStackEntry[] {
  const index = stack.findIndex((entry) => entry.reason === reason);
  if (index === -1) {
    return [...stack, { reason, patch }];
  }
  if (options?.replace !== true) {
    return stack;
  }
  return [
    ...stack.slice(0, index),
    ...stack.slice(index + 1),
    { reason, patch },
  ];
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
