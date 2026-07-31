import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppShell } from "./components/layout/AppShell";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { MacroBuilder } from "./components/macros/MacroBuilder";
import { HeadTrackingWizard } from "./components/head-tracking/HeadTrackingWizard";
import { AppToaster } from "./components/common/AppToaster";
import { computeContentHeightRatio } from "./lib/sectionLayouts";
import {
  isToolWindowLabel,
  PROFILE_UPDATED_EVENT,
  TOOL_WINDOW_REQUEST_EVENT,
  type ToolWindowLabel,
  type ToolWindowRequest,
} from "./lib/toolWindows";
import { useAppStore } from "./stores/appStore";

function MainApp() {
  const {
    loadProfileFiles,
    loadMonitors,
    loadKeyboardLayout,
    loadInputMethods,
    refreshLayoutKeyLabels,
    pollKeyboardState,
    checkForUpdates,
    setDictationState,
    refreshSttCapability,
    appendTyped,
    loadSuggestions,
    setLastError,
    loadImportedSongs,
  } = useAppStore();

  useEffect(() => {
    const init = async () => {
      await loadProfileFiles();
      await loadImportedSongs();
      await loadMonitors();
      const { settings } = useAppStore.getState();
      await invoke("cmd_apply_window_layout", {
        monitorId: settings.accessibilityMonitorId,
        collapsed: settings.collapsed,
        collapsedDictation:
          settings.collapsed && settings.dictationVisible !== false,
        heightRatio: computeContentHeightRatio({
          quickActions: settings.quickActionsVisible,
          phrases: settings.phrasesVisible,
        }),
      });
      await loadKeyboardLayout();
      await loadInputMethods();
      await refreshLayoutKeyLabels();
      await pollKeyboardState();
      await invoke("cmd_set_always_on_top", { enabled: true });
      await invoke("cmd_set_window_focusable", { focusable: false });
      void checkForUpdates();
      await refreshSttCapability();
    };
    init();
  }, [
    loadProfileFiles,
    loadImportedSongs,
    loadMonitors,
    loadKeyboardLayout,
    loadInputMethods,
    refreshLayoutKeyLabels,
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
        // (Groq worker could still emit while winding down).
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
      listen<{ source?: string }>(PROFILE_UPDATED_EVENT, (event) => {
        if (event.payload?.source === WebviewWindow.getCurrent().label) return;
        void useAppStore.getState().loadProfileFiles();
      }),
    );

    unlisteners.push(
      listen<ToolWindowRequest>(TOOL_WINDOW_REQUEST_EVENT, (event) => {
        const { label, show } = event.payload;
        const store = useAppStore.getState();
        switch (label) {
          case "settings":
            store.setShowSettings(show);
            break;
          case "macro-builder":
            store.setShowMacroBuilder(show);
            break;
          case "head-tracking":
            store.setShowHeadTrackingWizard(show);
            break;
          default: {
            const _exhaustive: never = label;
            return _exhaustive;
          }
        }
      }),
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
  ]);

  return <AppShell />;
}

function ToolApp({ label }: { label: ToolWindowLabel }) {
  const { loadProfileFiles, loadMonitors } = useAppStore();

  useEffect(() => {
    const init = async () => {
      await loadProfileFiles();
      await loadMonitors();
      const win = WebviewWindow.getCurrent();
      await win.setAlwaysOnTop(true);
      await win.setFocusable(true);
    };
    void init();
  }, [loadMonitors, loadProfileFiles]);

  useEffect(() => {
    const unlisten = listen<{ source?: string }>(PROFILE_UPDATED_EVENT, (event) => {
      if (event.payload?.source === WebviewWindow.getCurrent().label) return;
      void useAppStore.getState().loadProfileFiles();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  let panel;
  switch (label) {
    case "settings":
      panel = <SettingsPanel />;
      break;
    case "macro-builder":
      panel = <MacroBuilder />;
      break;
    case "head-tracking":
      panel = <HeadTrackingWizard />;
      break;
    default: {
      const _exhaustive: never = label;
      return _exhaustive;
    }
  }

  return (
    <>
      {panel}
      <AppToaster />
    </>
  );
}

function App() {
  const label = WebviewWindow.getCurrent().label;
  if (isToolWindowLabel(label)) {
    return <ToolApp label={label} />;
  }
  return <MainApp />;
}

export default App;
