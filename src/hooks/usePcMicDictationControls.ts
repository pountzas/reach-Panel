import { useAppStore } from "../stores/appStore";

/** Mic dictation actions shared by the keyboard Mic key and the collapsed mic FAB. */
export function usePcMicDictationControls() {
  const externalInputFocused = useAppStore((s) => s.externalInputFocused);
  const toggleDictation = useAppStore((s) => s.toggleDictation);
  return {
    externalInputFocused,
    toggleDictation,
  };
}
