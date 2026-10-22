import type { StateCreator } from "zustand";
import type { AppStore, ModeSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  startCompanionBridge,
  stopCompanionBridge,
  syncWindowLayoutFromSettings,
  syncInputPreviewEnabled,
  emitTeachingSession,
  emptyLanguageLessonState,
} from "../storeShared";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { resolveSectionStack, ensureSectionExpanded } from "../../lib/sectionStack";
import { shouldStopCompanionBridgeOnHostMode } from "../../lib/companionSession";
import { captureWindowHeightRatioBeforeTeaching, heightRatioAfterLeavingTeaching, shouldDelegateAppModeToMain, APP_MODE_REQUEST_EVENT } from "../../lib/appModeLayout";
import type { AppModeRequest } from "../../lib/appModeLayout";
import { popRestoreEntry, pushRestoreEntry } from "../lib/restoreStack";
import { clear as clearInputPreviewFrames } from "../../lib/inputPreviewFrames";

export const createModeSlice: StateCreator<
  AppStore,
  [],
  [],
  ModeSlice
> = (set, get) => ({
  restoreStack: [],
  pushRestore: (reason, patch, options) => {
    const next = pushRestoreEntry(get().restoreStack, reason, patch, options);
    if (next !== get().restoreStack) {
      set({ restoreStack: next });
    }
  },
  popRestore: (reason) => {
    const { stack, patch } = popRestoreEntry(get().restoreStack, reason);
    if (stack !== get().restoreStack) {
      set({ restoreStack: stack });
    }
    return patch;
  },
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
          get().popRestore("companion");
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
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
          get().popRestore("companion");
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
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
          get().popRestore("companion");
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
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
          get().popRestore("companion");
          set({
            companionModeActive: false,
            companionSessionLive: false,
            companionBridgeArmed: skipCompanionBridgeStop
              ? get().companionBridgeArmed
              : false,
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
        get().popRestore("companion");
        set({
          companionBridgeArmed: false,
          companionModeActive: false,
          companionSessionLive: false,
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
        const teachingPatch = inTeaching
          ? get().popRestore("teaching")
          : null;
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(
              teachingPatch?.windowHeightRatio ?? null,
            )
          : settings.windowHeightRatio;
        if (inTeaching) {
          storeFlags.liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
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
        if (inTeaching) {
          await syncInputPreviewEnabled(get);
        }
        await emitTeachingSession(get);
        return;
      }
      case "mic": {
        set({
          companionModeActive: false,
          focusModeKeyboardVisible: false,
          focusModeManualExpand: false,
        });
        const teachingPatch = inTeaching
          ? get().popRestore("teaching")
          : null;
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(
              teachingPatch?.windowHeightRatio ?? null,
            )
          : undefined;
        if (inTeaching) {
          storeFlags.liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          focusModeOverride: true,
          micMode: true,
          keyboardSectionMode: "keyboard",
          ...(inTeaching ? { windowHeightRatio: heightRestore } : {}),
        });
        if (inTeaching) {
          await syncInputPreviewEnabled(get);
        }
        await emitTeachingSession(get);
        return;
      }
      case "focus": {
        set({ companionModeActive: false });
        const teachingPatch = inTeaching
          ? get().popRestore("teaching")
          : null;
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(
              teachingPatch?.windowHeightRatio ?? null,
            )
          : undefined;
        if (inTeaching) {
          storeFlags.liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          focusModeOverride: true,
          micMode: false,
          keyboardSectionMode: "keyboard",
          ...(inTeaching ? { windowHeightRatio: heightRestore } : {}),
        });
        if (inTeaching) {
          await syncInputPreviewEnabled(get);
        }
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
        get().pushRestore(
          "teaching",
          {
            mode: previousMode,
            windowHeightRatio: captureWindowHeightRatioBeforeTeaching(
              settings.windowHeightRatio,
            ),
          },
          { replace: true },
        );
        set({ teachingLesson: "language" });
        clearInputPreviewFrames();
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
        await syncInputPreviewEnabled(get);
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
