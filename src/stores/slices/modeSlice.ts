import type { StateCreator } from "zustand";
import type { AppStore, ModeSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  startCompanionBridge,
  stopCompanionBridge,
  syncWindowLayoutFromSettings,
  emitTeachingSession,
  emptyLanguageLessonState,
} from "../storeShared";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { resolveSectionStack, ensureSectionExpanded } from "../../lib/sectionStack";
import { shouldStopCompanionBridgeOnHostMode } from "../../lib/companionSession";
import { captureWindowHeightRatioBeforeTeaching, heightRatioAfterLeavingTeaching, shouldDelegateAppModeToMain, APP_MODE_REQUEST_EVENT } from "../../lib/appModeLayout";
import type { AppModeRequest } from "../../lib/appModeLayout";

export const createModeSlice: StateCreator<
  AppStore,
  [],
  [],
  ModeSlice
> = (set, get) => ({
  setAppMode: async (mode, options) => {
    const skipCompanionBridgeStop = options?.skipCompanionBridgeStop === true;

    if (shouldDelegateAppModeToMain(WebviewWindow.getCurrent().label)) {
      const current = get().settings;
      switch (mode) {
        case "companion": {
          set({ companionBridgeArmed: true });
          break;
        }
        case "teaching":
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
            modeBeforeCompanion: null,
            musicTeachingEnabled: true,
            teachingLesson: "language",
            settings: {
              ...current,
              keyboardSectionMode: "synthesizer",
              focusModeOverride: false,
              micMode: false,
            },
          });
          break;
        case "mic":
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
            modeBeforeCompanion: null,
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            ...emptyLanguageLessonState(),
            settings: {
              ...current,
              keyboardSectionMode: "keyboard",
              focusModeOverride: true,
              micMode: true,
            },
          });
          break;
        case "focus":
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
            modeBeforeCompanion: null,
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            ...emptyLanguageLessonState(),
            settings: {
              ...current,
              keyboardSectionMode: "keyboard",
              focusModeOverride: true,
              micMode: false,
            },
          });
          break;
        case "normal":
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
            modeBeforeCompanion: null,
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            ...emptyLanguageLessonState(),
            settings: {
              ...current,
              keyboardSectionMode: "keyboard",
              focusModeOverride: false,
              micMode: false,
            },
          });
          break;
        default: {
          const _exhaustive: never = mode;
          return _exhaustive;
        }
      }
      await emit(APP_MODE_REQUEST_EVENT, {
        mode,
        skipCompanionBridgeStop,
      } satisfies AppModeRequest);
      return;
    }

    if (mode !== "companion" && !skipCompanionBridgeStop) {
      const { companionBridgeArmed, companionModeActive } = get();
      if (
        shouldStopCompanionBridgeOnHostMode(
          companionBridgeArmed,
          companionModeActive,
        )
      ) {
        set({
          companionBridgeArmed: false,
          companionModeActive: false,
          companionSessionLive: false,
          modeBeforeCompanion: null,
        });
        await stopCompanionBridge();
      }
    }

    const state = get();
    const { settings, musicTeachingEnabled } = state;
    const inTeaching =
      musicTeachingEnabled && settings.keyboardSectionMode === "synthesizer";

    switch (mode) {
      case "companion": {
        await startCompanionBridge();
        set({ companionBridgeArmed: true });
        const afterStart = get();
        if (afterStart.companionModeActive || afterStart.companionSessionLive) {
          await WebviewWindow.getCurrent().minimize();
        }
        return;
      }
      case "normal": {
        set({ companionModeActive: false });
        // Clear teaching first so leavingSynthesizer does not restore Focus.
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(
              state.windowHeightRatioBeforeTeaching,
            )
          : settings.windowHeightRatio;
        if (inTeaching) {
          storeFlags.liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            modeBeforeTeaching: null,
            windowHeightRatioBeforeTeaching: null,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          focusModeOverride: false,
          micMode: false,
          keyboardSectionMode: "keyboard",
          ...(inTeaching ? { windowHeightRatio: heightRestore } : {}),
        });
        // Explicit Normal must re-apply non-focus layout even if refresh was a no-op.
        await syncWindowLayoutFromSettings(get().settings, true, false);
        await emitTeachingSession(get);
        return;
      }
      case "mic": {
        set({
          companionModeActive: false,
          focusModeKeyboardVisible: false,
          focusModeManualExpand: false,
        });
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(
              state.windowHeightRatioBeforeTeaching,
            )
          : undefined;
        if (inTeaching) {
          storeFlags.liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            modeBeforeTeaching: null,
            windowHeightRatioBeforeTeaching: null,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          focusModeOverride: true,
          micMode: true,
          keyboardSectionMode: "keyboard",
          ...(inTeaching ? { windowHeightRatio: heightRestore } : {}),
        });
        await emitTeachingSession(get);
        return;
      }
      case "focus": {
        set({ companionModeActive: false });
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(
              state.windowHeightRatioBeforeTeaching,
            )
          : undefined;
        if (inTeaching) {
          storeFlags.liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            modeBeforeTeaching: null,
            windowHeightRatioBeforeTeaching: null,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          focusModeOverride: true,
          micMode: false,
          keyboardSectionMode: "keyboard",
          ...(inTeaching ? { windowHeightRatio: heightRestore } : {}),
        });
        await emitTeachingSession(get);
        return;
      }
      case "teaching": {
        set({ companionModeActive: false });
        if (inTeaching) {
          return;
        }
        const previousMode: "normal" | "focus" | "mic" =
          settings.focusModeOverride === true
            ? settings.micMode === true
              ? "mic"
              : "focus"
            : "normal";
        set({
          modeBeforeTeaching: previousMode,
          windowHeightRatioBeforeTeaching:
            captureWindowHeightRatioBeforeTeaching(settings.windowHeightRatio),
          teachingLesson: "language",
        });
        // Flags on before synthesizer patch so first layout sync sees Teaching.
        await get().enableMusicTeaching();
        const sectionStack = ensureSectionExpanded(
          resolveSectionStack(get().settings.sectionStack),
          "teaching",
        );
        await get().updateSettings({
          focusModeOverride: false,
          micMode: false,
          keyboardSectionMode: "synthesizer",
          sectionStack,
        });
        await emitTeachingSession(get);
        return;
      }
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  },
});
