import type { StateCreator } from "zustand";
import type { AppStore, WindowSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  syncFocusModeWindowLayout,
  ensureUpdatePromptVisible,
  teachingFullWorkAreaActive,
  heightRatioFromSettings,
  setToolWindowVisible,
  persistSettingsIfCurrent,
  languageLessonModeFromState,
  freeWriteModeFromState,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { logLayoutIpc } from "../../lib/logIpc";
import { checkForUpdate, formatUpdateCheckError } from "../../lib/updater";
import { prefersReducedMotion } from "../../lib/motion";
import { clampWindowHeightRatio } from "../../lib/sectionLayouts";
import { shouldApplyLiveWindowHeightRatio } from "../../lib/windowHeightDrag";
import { isLanguageLessonCaptureActive } from "../../lib/language";
import { isFreeWriteCaptureActive } from "../../lib/teaching";

/** Read+clear queued live height; typed widen so post-await races stay checkable. */
function takeLiveHeightRatioPending(): number | null {
  const value: number | null = storeFlags.liveHeightRatioPending;
  storeFlags.liveHeightRatioPending = null;
  return value;
}

export const createWindowSlice: StateCreator<AppStore, [], [], WindowSlice> = (
  set,
  get,
) => ({
  showSettings: false,
  isAnimatingWindow: false,
  pendingUpdate: null,
  updateCheckStatus: "idle",
  updateCheckError: null,
  applyWindowHeightRatioLive: async (ratio) => {
    const {
      settings,
      musicTeachingEnabled,
      focusModeActive,
      focusModeKeyboardVisible,
    } = get();
    if (
      !shouldApplyLiveWindowHeightRatio({
        collapsed: settings.collapsed,
        focusModeActive,
        focusModeKeyboardVisible,
      })
    ) {
      return;
    }
    // Grip maps cursor → ratio directly. Do not floor to contentRatio here —
    // that locked full layouts at 1.0 and made the handle feel stuck/weird.
    const heightRatio = clampWindowHeightRatio(ratio);
    if (
      storeFlags.liveHeightRatioPreview !== null &&
      Math.abs(storeFlags.liveHeightRatioPreview - heightRatio) < 0.002
    ) {
      return;
    }
    storeFlags.liveHeightRatioPending = heightRatio;
    if (
      storeFlags.liveHeightRatioRaf !== null ||
      storeFlags.liveHeightRatioInFlight
    )
      return;

    await new Promise<void>((resolve) => {
      storeFlags.liveHeightRatioRaf = requestAnimationFrame(() => {
        storeFlags.liveHeightRatioRaf = null;
        resolve();
      });
    });

    const pending = takeLiveHeightRatioPending();
    if (pending === null) return;
    if (
      storeFlags.liveHeightRatioPreview !== null &&
      Math.abs(storeFlags.liveHeightRatioPreview - pending) < 0.002
    ) {
      return;
    }

    const latestState = get();
    const latest = latestState.settings;
    if (
      !shouldApplyLiveWindowHeightRatio({
        collapsed: latest.collapsed,
        focusModeActive: latestState.focusModeActive,
        focusModeKeyboardVisible: latestState.focusModeKeyboardVisible,
      })
    ) {
      return;
    }
    storeFlags.liveHeightRatioPreview = pending;
    storeFlags.liveHeightRatioInFlight = true;
    try {
      const focus = latestState.focusModeActive;
      const liveArgs = {
        monitorId: latest.accessibilityMonitorId,
        collapsed: false,
        collapsedDictation: false,
        heightRatio: pending,
        focusMode: focus,
        focusKeyboardVisible: focus
          ? latestState.focusModeKeyboardVisible
          : false,
        focusKeyboardHeightRatio: focus ? pending : undefined,
        fullWorkArea: teachingFullWorkAreaActive(latest, musicTeachingEnabled),
      };
      logLayoutIpc("cmd_apply_window_layout", liveArgs);
      await invoke("cmd_apply_window_layout", liveArgs);
    } catch {
      // Rejected ratio must not block near-equal retries.
      if (storeFlags.liveHeightRatioPreview === pending) {
        storeFlags.liveHeightRatioPreview = null;
      }
    } finally {
      storeFlags.liveHeightRatioInFlight = false;
      // Flush any ratio queued while the previous invoke was in flight.
      const queued = takeLiveHeightRatioPending();
      if (queued !== null) {
        void get().applyWindowHeightRatioLive(queued);
      }
    }
  },
  setShowSettings: (show) => {
    void setToolWindowVisible(get, set, "settings", show);
  },
  syncWindowFocusable: async () => {
    const state = get();
    const needsFocus =
      state.pendingUpdate !== null ||
      isLanguageLessonCaptureActive(languageLessonModeFromState(state)) ||
      isFreeWriteCaptureActive(freeWriteModeFromState(state));
    await invoke("cmd_set_window_focusable", { focusable: needsFocus });
  },
  toggleCollapsed: async () => {
    if (get().isAnimatingWindow) {
      return;
    }
    set({ modeMenuOpen: false });
    const epoch = get().settingsEpoch;
    const { settings } = get();
    const collapsed = !settings.collapsed;
    const next = { ...settings, collapsed };

    set({ isAnimatingWindow: true });
    try {
      if (collapsed) {
        if (get().settingsEpoch !== epoch) {
          return;
        }
        set({ settings: next });
        const persisted = await persistSettingsIfCurrent(get, epoch, next);
        if (!persisted) {
          return;
        }
        const collapseArgs = {
          monitorId: next.accessibilityMonitorId,
          collapsed: true,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(
            next,
            get().musicTeachingEnabled,
          ),
          fullWorkArea: teachingFullWorkAreaActive(
            next,
            get().musicTeachingEnabled,
          ),
        };
        const collapseCmd = prefersReducedMotion()
          ? "cmd_apply_window_layout"
          : "cmd_animate_window_layout";
        logLayoutIpc(collapseCmd, collapseArgs);
        await invoke(collapseCmd, collapseArgs);
      } else {
        const expandArgs = {
          monitorId: settings.accessibilityMonitorId,
          collapsed: false,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(
            settings,
            get().musicTeachingEnabled,
          ),
          fullWorkArea: teachingFullWorkAreaActive(
            settings,
            get().musicTeachingEnabled,
          ),
        };
        const expandCmd = prefersReducedMotion()
          ? "cmd_apply_window_layout"
          : "cmd_animate_window_layout";
        logLayoutIpc(expandCmd, expandArgs);
        await invoke(expandCmd, expandArgs);
        if (get().settingsEpoch !== epoch) {
          return;
        }
        set({ settings: next });
        await persistSettingsIfCurrent(get, epoch, next);
      }
    } finally {
      set({ isAnimatingWindow: false });
      const queued = storeFlags.pendingFocusLayoutSync;
      storeFlags.pendingFocusLayoutSync = null;
      if (queued !== null && get().focusModeActive) {
        void syncFocusModeWindowLayout(get, set, queued);
      }
    }
  },
  setPendingUpdate: (update) => {
    set({ pendingUpdate: update });
    void get().syncWindowFocusable();
    // Expand mini keyboard / uncollapse so the themed modal has room to render.
    if (update) {
      void ensureUpdatePromptVisible(get);
    }
  },
  checkForUpdates: async () => {
    set({ updateCheckStatus: "checking", updateCheckError: null });
    try {
      const update = await checkForUpdate();
      if (update) {
        set({
          pendingUpdate: update,
          updateCheckStatus: "idle",
          updateCheckError: null,
        });
        void ensureUpdatePromptVisible(get);
      } else {
        set({
          pendingUpdate: null,
          updateCheckStatus: "upToDate",
          updateCheckError: null,
        });
      }
    } catch (error) {
      console.error("Update check failed", error);
      set({
        pendingUpdate: null,
        updateCheckStatus: "error",
        updateCheckError: formatUpdateCheckError(error),
      });
    }
    void get().syncWindowFocusable();
  },
});
