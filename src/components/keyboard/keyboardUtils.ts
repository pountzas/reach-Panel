import type { FnKeyMode } from "../../lib/types";

export function clearModifiersAfterKey(
  fnKeyMode: FnKeyMode,
  activeModifiers: readonly string[],
  usedFn: boolean,
  clearStickyExceptFn: () => void,
  clearSticky: () => void,
): void {
  if (fnKeyMode === "latched") {
    if (activeModifiers.length) clearStickyExceptFn();
    return;
  }
  if (activeModifiers.length || usedFn) clearSticky();
}
