import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppShell } from "./components/layout/AppShell";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { MacroBuilder } from "./components/macros/MacroBuilder";
import { HeadTrackingWizard } from "./components/head-tracking/HeadTrackingWizard";
import { AppToaster } from "./components/common/AppToaster";
import { UpdatePrompt } from "./components/common/UpdatePrompt";
import { computeContentHeightRatioFromSettings } from "./lib/sectionLayouts";
import {
  isToolWindowLabel,
  PROFILE_UPDATED_EVENT,
  TOOL_WINDOW_REQUEST_EVENT,
  type ToolWindowLabel,
  type ToolWindowRequest,
} from "./lib/toolWindows";
import {
  isMusicLessonSlotVisible,
  isTeachingFullWorkArea,
  isV1ToolWindowHidden,
} from "./lib/v1HiddenFeatures";
import { useAppStore } from "./stores/appStore";

const KEYBOARD_POLL_MS = 100;

function MainApp() {
  const loadProfileFiles = useAppStore((s) => s.loadProfileFiles);
  const loadMonitors = useAppStore((s) => s.loadMonitors);
  const loadKeyboardLayout = useAppStore((s) => s.loadKeyboardLayout);
  const loadInputMethods = useAppStore((s) => s.loadInputMethods);
  const refreshLayoutKeyLabels = useAppStore((s) => s.refreshLayoutKeyLabels);
  const pollKeyboardState = useAppStore((s) => s.pollKeyboardState);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);
  const setDictationState = useAppStore((s) => s.setDictationState);
  const refreshSttCapability = useAppStore((s) => s.refreshSttCapability);
  const appendTyped = useAppStore((s) => s.appendTyped);
  const loadSuggestions = useAppStore((s) => s.loadSuggestions);
  const setLastError = useAppStore((s) => s.setLastError);
  const loadImportedSongs = useAppStore((s) => s.loadImportedSongs);

  useEffect(() => {
    let cancelled = false;
    let pollId: number | null = null;
    const init = async () => {
      try {
        await loadProfileFiles();
        if (cancelled) return;
        await loadImportedSongs();
        await loadMonitors();
        if (cancelled) return;
        await useAppStore.getState().refreshMiniModeState({ animate: false });
        if (cancelled) return;
        if (!useAppStore.getState().miniModeActive) {
          const { settings, musicTeachingEnabled } = useAppStore.getState();
          const lessonSlotVisible = isMusicLessonSlotVisible({
            musicTeachingEnabled,
            keyboardSectionMode: settings.keyboardSectionMode,
          });
          const fullWorkArea = isTeachingFullWorkArea({
            musicTeachingEnabled,
            keyboardSectionMode: settings.keyboardSectionMode,
          });
          await invoke("cmd_apply_window_layout", {
            monitorId: settings.accessibilityMonitorId,
            collapsed: settings.collapsed,
            collapsedDictation: false,
            heightRatio: fullWorkArea
              ? 1.0
              : computeContentHeightRatioFromSettings(settings, lessonSlotVisible),
            fullWorkArea,
          });
        }
        await loadKeyboardLayout();
        await loadInputMethods();
        await refreshLayoutKeyLabels();
        await pollKeyboardState();
        await invoke("cmd_set_always_on_top", { enabled: true });
        await invoke("cmd_set_window_focusable", { focusable: false });
        void checkForUpdates();
        await refreshSttCapability();
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (cancelled) return;
        // Start polling even if earlier setup steps failed so keyboard state
        // stays fresh; profile hydration errors are surfaced via setLastError.
        pollId = window.setInterval(() => {
          if (document.hidden) return;
          void pollKeyboardState();
        }, KEYBOARD_POLL_MS);
      }
    };
    void init();
    return () => {
      cancelled = true;
      if (pollId !== null) window.clearInterval(pollId);
    };
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
    setLastError,
  ]);

  useEffect(() => {
    // Touch↔mouse layout switch (store debounces rapid alternating pointerdowns).
    const onPointerDown = (event: PointerEvent) => {
      useAppStore.getState().handlePointerInputEvent(event.pointerType);
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, []);

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
        if (show && isV1ToolWindowHidden(label)) {
          return;
        }
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

  const pendingUpdate = useAppStore((s) => s.pendingUpdate);
  const setPendingUpdate = useAppStore((s) => s.setPendingUpdate);

  return (
    <>
      <AppShell />
      {pendingUpdate && (
        <UpdatePrompt
          update={pendingUpdate}
          onDismiss={() => setPendingUpdate(null)}
        />
      )}
      <AppToaster />
    </>
  );
}

function ToolApp({ label }: { label: ToolWindowLabel }) {
  const loadProfileFiles = useAppStore((s) => s.loadProfileFiles);
  const loadMonitors = useAppStore((s) => s.loadMonitors);

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
      if (isV1ToolWindowHidden("macro-builder")) {
        return null;
      }
      panel = <MacroBuilder />;
      break;
    case "head-tracking":
      if (isV1ToolWindowHidden("head-tracking")) {
        return null;
      }
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
