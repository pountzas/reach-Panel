import { useAppStore } from "../stores/appStore";

/** Mic dictation actions shared by the keyboard Mic key and the collapsed mic FAB. */
export function usePcMicDictationControls() {
  const externalInputFocused = useAppStore((s) => s.externalInputFocused);
  const toggleDictation = useAppStore((s) => s.toggleDictation);
  const startPcMicHold = useAppStore((s) => s.startPcMicHold);
  const stopPcMicHold = useAppStore((s) => s.stopPcMicHold);
  return {
    externalInputFocused,
    toggleDictation,
    startPcMicHold,
    stopPcMicHold,
  };
}
