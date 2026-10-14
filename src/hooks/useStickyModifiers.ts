import { useAppStore } from "../stores/appStore";
import { isFnActive, isShiftActive } from "../lib/keyboardLayouts";

/** Sticky modifier state + derived shift/fn flags for the on-screen keyboard. */
export function useStickyModifiers() {
  const stickyModifiers = useAppStore((s) => s.stickyModifiers);
  const physicalKeyState = useAppStore((s) => s.physicalKeyState);
  const toggleSticky = useAppStore((s) => s.toggleSticky);
  const clearSticky = useAppStore((s) => s.clearSticky);
  const clearStickyExceptFn = useAppStore((s) => s.clearStickyExceptFn);

  const shiftActive = isShiftActive(physicalKeyState, stickyModifiers);
  const fnActive = isFnActive(stickyModifiers);
  const activeModifiers = stickyModifiers.filter((m) => m !== "capslock" && m !== "fn");

  return {
    stickyModifiers,
    physicalKeyState,
    shiftActive,
    fnActive,
    activeModifiers,
    toggleSticky,
    clearSticky,
    clearStickyExceptFn,
  };
}
