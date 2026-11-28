import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";

/** Release held mic keys on window blur or loss of external text focus. */
export function usePcMicHoldRelease(): void {
  const pcMicHolding = useAppStore((s) => s.pcMicHolding);
  const externalInputFocused = useAppStore((s) => s.externalInputFocused);
  const stopPcMicHold = useAppStore((s) => s.stopPcMicHold);

  useEffect(() => {
    if (!pcMicHolding) return;
    const onBlur = () => {
      void stopPcMicHold();
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
    };
  }, [pcMicHolding, stopPcMicHold]);

  useEffect(() => {
    if (pcMicHolding && !externalInputFocused) {
      void stopPcMicHold();
    }
  }, [pcMicHolding, externalInputFocused, stopPcMicHold]);
}
