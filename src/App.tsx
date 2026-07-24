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
      });
      await loadKeyboardLayout();
      await pollKeyboardState();
      await invoke("cmd_set_always_on_top", { enabled: true });
      await invoke("cmd_set_window_focusable", { focusable: false });
      void checkForUpdates();

      try {
        const status = await invoke<{ state: "idle" | "listening" | "processing" }>(
          "cmd_get_stt_status",
        );
        setDictationState(status.state);
      } catch {
        setDictationState("idle");
      }
    };
    init();
  }, [
    loadProfileFiles,
    loadMonitors,
    loadKeyboardLayout,
    pollKeyboardState,
    checkForUpdates,
    setDictationState,
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
      }),
    );

    return () => {
      void Promise.all(unlisteners).then((stops) => {
        for (const stop of stops) stop();
      });
    };
  }, [appendTyped, loadSuggestions, setDictationState, setLastError]);

  return <AppShell />;
}

export default App;
