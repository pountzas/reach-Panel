import { useEffect, type ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppShell } from "./components/layout/AppShell";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { AppToaster } from "./components/common/AppToaster";
import { UpdatePrompt } from "./components/common/UpdatePrompt";
import { resolveWindowHeightRatio } from "./lib/sectionLayouts";
import { DictationOverlay } from "./components/keyboard/DictationOverlay";
import {
  hideDictationOverlay,
  showDictationOverlay,
  DICTATION_OVERLAY_LABEL,
} from "./lib/dictationOverlayWindow";
import {
  isToolWindowLabel,
  PROFILE_UPDATED_EVENT,
  TOOL_WINDOW_REQUEST_EVENT,
  type ToolWindowLabel,
  type ToolWindowRequest,
} from "./lib/toolWindows";
import {
  APP_MODE_REQUEST_EVENT,
  TEACHING_LESSON_REQUEST_EVENT,
  TEACHING_SESSION_EVENT,
  TEACHING_SESSION_REQUEST_EVENT,
  type AppModeRequest,
  type TeachingLessonRequest,
  type TeachingSessionPayload,
} from "./lib/appModeLayout";
import {
  type CompanionSessionEventPayload,
  type CompanionUiState,
} from "./lib/companionSession";
import { reconcileAutostartOnLoad } from "./lib/autostart";
import { logIpc, logLayoutIpc } from "./lib/logIpc";
import { isTeachingFullWorkArea } from "./lib/v1HiddenFeatures";
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
  const loadCustomLanguagePacks = useAppStore((s) => s.loadCustomLanguagePacks);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    let pollId: number | null = null;
    const init = async () => {
      try {
        await loadProfileFiles();
        if (isCancelled()) return;
        await loadImportedSongs();
        await loadCustomLanguagePacks();
        await loadMonitors();
        if (isCancelled()) return;
        await useAppStore.getState().refreshFocusModeState({ animate: false });
        if (isCancelled()) return;
        if (!useAppStore.getState().focusModeActive) {
          const { settings, musicTeachingEnabled } = useAppStore.getState();
          const fullWorkArea = isTeachingFullWorkArea({
            musicTeachingEnabled,
            keyboardSectionMode: settings.keyboardSectionMode,
          });
          const bootLayoutArgs = {
            monitorId: settings.accessibilityMonitorId,
            collapsed: settings.collapsed,
            collapsedDictation: false,
            heightRatio: resolveWindowHeightRatio(settings.windowHeightRatio, {
              teachingFullWorkArea: fullWorkArea,
            }),
            fullWorkArea,
          };
          logLayoutIpc("cmd_apply_window_layout", bootLayoutArgs);
          await invoke("cmd_apply_window_layout", bootLayoutArgs);
        }
        await loadKeyboardLayout();
        await loadInputMethods();
        await refreshLayoutKeyLabels();
        await pollKeyboardState();
        await invoke("cmd_set_always_on_top", { enabled: true });
        await invoke("cmd_set_window_focusable", { focusable: false });
        void checkForUpdates();
        void reconcileAutostartOnLoad().catch((error: unknown) => {
          console.warn("autostart reconcile failed", error);
        });
        await refreshSttCapability();
      } catch (error) {
        if (!isCancelled()) {
          setLastError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!isCancelled()) {
          // Start polling even if earlier setup steps failed so keyboard state
          // stays fresh; profile hydration errors are surfaced via setLastError.
          pollId = window.setInterval(() => {
            if (document.hidden) return;
            void pollKeyboardState();
          }, KEYBOARD_POLL_MS);
        }
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
    loadCustomLanguagePacks,
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
      if (import.meta.env.DEV) {
        console.debug(
          "pd",
          event.pointerType,
          event.pointerId,
          event.isPrimary,
          event.button,
          Math.round(performance.now()),
        );
      }
      useAppStore.getState().handlePointerInputEvent({
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
      });
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<{ state: "idle" | "listening" | "processing" }>(
        "stt-state",
        (event) => {
          // Ignore late listening/processing events after the user already stopped
          // (Groq worker could still emit while winding down).
          if (
            event.payload.state !== "idle" &&
            useAppStore.getState().dictationState === "idle"
          ) {
            return;
          }
          setDictationState(event.payload.state);
        },
      ),
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
        void invoke("cmd_stop_dictation").catch(logIpc("cmd_stop_dictation"));
        void refreshSttCapability();
      }),
    );

    unlisteners.push(
      listen<{ source?: string }>(PROFILE_UPDATED_EVENT, (event) => {
        if (event.payload.source === WebviewWindow.getCurrent().label) return;
        void useAppStore.getState().loadProfileFiles();
      }),
    );

    unlisteners.push(
      listen<AppModeRequest>(APP_MODE_REQUEST_EVENT, (event) => {
        void useAppStore.getState().setAppMode(event.payload.mode, {
          skipCompanionBridgeStop: event.payload.skipCompanionBridgeStop,
        });
      }),
    );

    unlisteners.push(
      listen<CompanionUiState>("companion-state", (event) => {
        void useAppStore
          .getState()
          .applyCompanionSessionPhase(event.payload.session);
      }),
    );

    unlisteners.push(
      listen<CompanionSessionEventPayload>("companion-session", (event) => {
        void useAppStore
          .getState()
          .applyCompanionSessionPhase(event.payload.phase);
      }),
    );

    unlisteners.push(
      listen<TeachingLessonRequest>(TEACHING_LESSON_REQUEST_EVENT, (event) => {
        useAppStore.getState().setTeachingLesson(event.payload.lesson);
      }),
    );

    unlisteners.push(
      listen(TEACHING_SESSION_REQUEST_EVENT, () => {
        void useAppStore.getState().broadcastTeachingSession();
      }),
    );

    unlisteners.push(
      listen<ToolWindowRequest>(TOOL_WINDOW_REQUEST_EVENT, (event) => {
        const { label, show } = event.payload;
        const store = useAppStore.getState();
        const applyShow: Record<ToolWindowLabel, (next: boolean) => void> = {
          settings: (next) => {
            store.setShowSettings(next);
          },
        };
        applyShow[label](show);
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

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (s.dictationState === prev.dictationState) return;
      if (s.dictationState === "idle") void hideDictationOverlay();
      else if (prev.dictationState === "idle") void showDictationOverlay();
    });
    return () => {
      unsubscribe();
      void hideDictationOverlay();
    };
  }, []);

  const pendingUpdate = useAppStore((s) => s.pendingUpdate);
  const setPendingUpdate = useAppStore((s) => s.setPendingUpdate);

  return (
    <>
      <AppShell />
      {pendingUpdate && (
        <UpdatePrompt
          update={pendingUpdate}
          onDismiss={() => {
            setPendingUpdate(null);
          }}
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
      await emit(TEACHING_SESSION_REQUEST_EVENT);
    };
    void init();
  }, [loadMonitors, loadProfileFiles]);

  useEffect(() => {
    const unlisteners = [
      listen<{ source?: string }>(PROFILE_UPDATED_EVENT, (event) => {
        if (event.payload.source === WebviewWindow.getCurrent().label) return;
        void useAppStore.getState().loadProfileFiles();
      }),
      listen<TeachingSessionPayload>(TEACHING_SESSION_EVENT, (event) => {
        useAppStore.getState().applyTeachingSession(event.payload);
      }),
    ];
    return () => {
      void Promise.all(unlisteners).then((stops) => {
        for (const stop of stops) stop();
      });
    };
  }, []);

  const panels = {
    settings: <SettingsPanel />,
  } satisfies Record<ToolWindowLabel, ReactElement>;

  return (
    <>
      {panels[label]}
      <AppToaster />
    </>
  );
}

function App() {
  const label = WebviewWindow.getCurrent().label;
  if (label === DICTATION_OVERLAY_LABEL) {
    return <DictationOverlay />;
  }
  if (isToolWindowLabel(label)) {
    return <ToolApp label={label} />;
  }
  return <MainApp />;
}

export default App;
