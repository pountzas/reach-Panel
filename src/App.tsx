import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { useAppStore } from "./stores/appStore";

function App() {
  const {
    loadProfileFiles,
    loadMonitors,
    loadKeyboardLayout,
    pollKeyboardState,
    checkForUpdates,
    setDictationState,
    refreshSttCapability,
    setSttCapability,
    appendTyped,
    loadSuggestions,
    setLastError,
  } = useAppStore();

  useEffect(() => {
    const init = async () => {
      await loadProfileFiles();
      await loadMonitors();
      const { settings } = useAppStore.getState();
      await invoke("cmd_apply_window_layout", {
        monitorId: settings.accessibilityMonitorId,
        collapsed: settings.collapsed,
        collapsedDictation:
          settings.collapsed && settings.dictationVisible !== false,
      });
      await loadKeyboardLayout();
      await pollKeyboardState();
      await invoke("cmd_set_always_on_top", { enabled: true });
      await invoke("cmd_set_window_focusable", { focusable: false });
      void checkForUpdates();
      await refreshSttCapability();
    };
    init();
  }, [
    loadProfileFiles,
    loadMonitors,
    loadKeyboardLayout,
    pollKeyboardState,
    checkForUpdates,
    refreshSttCapability,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void pollKeyboardState();
    }, 50);
    return () => window.clearInterval(id);
  }, [pollKeyboardState]);

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];

    unlisteners.push(
      listen<{ state: "idle" | "listening" | "processing" }>("stt-state", (event) => {
        // Ignore late listening/processing events after the user already stopped
        // (Whisper worker could still emit while winding down).
        if (
          event.payload.state !== "idle" &&
          useAppStore.getState().dictationState === "idle"
        ) {
          return;
        }
        setDictationState(event.payload.state);
      }),
    );

    unlisteners.push(
      listen<{ text: string; isFinal: boolean }>("stt-result", (event) => {
        if (!event.payload.isFinal || !event.payload.text) return;
        appendTyped(event.payload.text);
        void loadSuggestions();
      }),
    );

    unlisteners.push(
      listen<{ message: string }>("stt-error", (event) => {
        setDictationState("idle");
        setLastError(event.payload.message);
        void refreshSttCapability();
      }),
    );

    unlisteners.push(
      listen<{ progress: number; ready: boolean; error: string | null }>(
        "stt-whisper-download",
        (event) => {
          const current = useAppStore.getState().sttCapability;
          setSttCapability({
            engine: current?.engine ?? null,
            whisperReady: event.payload.ready,
            whisperDownloading: !event.payload.ready && !event.payload.error,
            winrtSupported: current?.winrtSupported ?? false,
            online: current?.online ?? false,
            canDictate:
              event.payload.ready ||
              ((current?.online ?? false) && (current?.winrtSupported ?? false)),
          });
          if (event.payload.error) {
            setLastError(`WHISPER_MODEL: ${event.payload.error}`);
          }
          if (event.payload.ready) {
            void refreshSttCapability();
          }
        },
      ),
    );

    return () => {
      void Promise.all(unlisteners).then((stops) => {
        for (const stop of stops) stop();
      });
    };
  }, [
    appendTyped,
    loadSuggestions,
    refreshSttCapability,
    setDictationState,
    setLastError,
    setSttCapability,
  ]);

  return <AppShell />;
}

export default App;
