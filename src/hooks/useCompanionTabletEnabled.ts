import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isCompanionTabletEnabled,
  type CompanionUiState,
} from "../lib/companionSession";
import { useAppStore } from "../stores/appStore";

/** Whether the Companion mode tablet should be tappable (bridge up or tablet paired). */
export function useCompanionTabletEnabled(): boolean {
  const companionBridgeArmed = useAppStore((s) => s.companionBridgeArmed);
  const companionSessionLive = useAppStore((s) => s.companionSessionLive);
  const [bridgeRunning, setBridgeRunning] = useState(false);
  const [pairedDeviceCount, setPairedDeviceCount] = useState(0);

  useEffect((): (() => void) => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await invoke<CompanionUiState>("cmd_companion_status");
        if (cancelled) return;
        setBridgeRunning(status.running);
        setPairedDeviceCount(status.pairedDeviceCount);
      } catch {
        if (!cancelled) {
          setBridgeRunning(false);
          setPairedDeviceCount(0);
        }
      }
    };
    void refresh();
    const unlisten = listen<CompanionUiState>("companion-state", (event) => {
      setBridgeRunning(event.payload.running);
      setPairedDeviceCount(event.payload.pairedDeviceCount);
    });
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return isCompanionTabletEnabled({
    bridgeRunning,
    pairedDeviceCount,
    companionBridgeArmed,
    companionSessionLive,
  });
}
