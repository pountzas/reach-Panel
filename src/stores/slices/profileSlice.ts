import type { StateCreator } from "zustand";
import type { AppStore, ProfileSlice } from "../types";
import { storeFlags } from "../storeFlags";
import {
  commitSuggestionList,
  POINTER_INPUT_KIND_DEBOUNCE_MS,
  syncFocusModeWindowLayout,
  refreshFocusModeStateHelper,
  LANGUAGE_CHANGE_FALLBACK,
  teachingFullWorkAreaActive,
  heightRatioFromSettings,
  syncWindowLayoutFromSettings,
  buildDefaultSettings,
  syncInputPreviewEnabled,
  loadProfileData,
  persistSettingsIfCurrent,
  emptyLanguageLessonState,
  clearGreekPendingAccent,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CommandResult, DEFAULT_SETTINGS, MonitorInfo, ProfileFileInfo } from "../../lib/types";
import { isWidePianoOctaveCount, resolveSynthOctaveCount, resolveSynthStartOctave } from "../../lib/music/octaveCount";
import { logLayoutIpc } from "../../lib/logIpc";
import { notify } from "../../lib/notify";
import { PROFILE_UPDATED_EVENT } from "../../lib/toolWindows";
import { heightRatioAfterLeavingTeaching, shouldSyncNonFocusWindowLayout } from "../../lib/appModeLayout";
import { partialContainsLayoutFields, persistLayoutForKind, pointerKindFromEvent, stripFullscreenHeightFromLayoutSnapshots, switchPointerInputKindLayout } from "../../lib/layoutProfiles";

export const createProfileSlice: StateCreator<
  AppStore,
  [],
  [],
  ProfileSlice
> = (set, get) => ({
  profileFiles: [],
  activeProfileFile: null,
  settings: DEFAULT_SETTINGS,
  settingsEpoch: 0,
  profileHydrated: false,
  pointerInputKind: "mouse",
  monitors: [],
  loadProfileFiles: async () => {
    const [profileFiles, activeProfileFile] = await Promise.all([
      invoke<ProfileFileInfo[]>("cmd_list_profile_files"),
      invoke<string>("cmd_get_active_profile_file"),
    ]);
    set({
      profileFiles,
      activeProfileFile: activeProfileFile || profileFiles[0]?.filename || null,
    });
    await loadProfileData(set, get);
    set({ profileHydrated: true });
  },
  setProfileFile: async (filename) => {
    // Invalidate in-flight full-settings writers before the backend switch.
    set({ settingsEpoch: get().settingsEpoch + 1 });
    await invoke("cmd_load_profile_file", { filename });
    set({
      activeProfileFile: filename,
      typedBuffer: "",
      ...clearGreekPendingAccent(),
      stickyModifiers: [],
    });
    await loadProfileData(set, get, { animateLayout: true });
    await get().loadSuggestions();
    await emit(PROFILE_UPDATED_EVENT, {
      source: WebviewWindow.getCurrent().label,
    });
  },
  createProfileFile: async (filename, name) => {
    await invoke("cmd_create_profile_file", { filename, name });
    await get().loadProfileFiles();
    await emit(PROFILE_UPDATED_EVENT, {
      source: WebviewWindow.getCurrent().label,
    });
  },
  deleteProfileFile: async (filename) => {
    const nextActive = await invoke<string>("cmd_delete_profile_file", {
      filename,
    });
    set({
      typedBuffer: "",
      ...clearGreekPendingAccent(),
      stickyModifiers: [],
      activeProfileFile: nextActive,
    });
    await get().loadProfileFiles();
    await get().loadSuggestions();
  },
  updateSettings: async (partial, options) => {
    if (!get().profileHydrated) {
      return;
    }
    const epoch = get().settingsEpoch;
    const { settings } = get();
    const syncToSystem = options?.syncToSystem ?? true;
    const typingLanguageChanged =
      partial.typingLanguage !== undefined &&
      partial.typingLanguage !== settings.typingLanguage;
    const uiLanguageChanged =
      partial.uiLanguage !== undefined &&
      partial.uiLanguage !== settings.uiLanguage;
    const previousTypingLanguage = settings.typingLanguage;
    let next = {
      ...settings,
      ...partial,
      ...(partial.synthesizerOctaveCount !== undefined
        ? {
            synthesizerOctaveCount: resolveSynthOctaveCount(
              partial.synthesizerOctaveCount,
            ),
          }
        : {}),
    };
    // Explicit undefined clears a persisted Teaching 1.0 (spread alone keeps the old value).
    let shouldStripFullscreenLayouts = false;
    if (
      Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio") &&
      partial.windowHeightRatio === undefined
    ) {
      delete next.windowHeightRatio;
      shouldStripFullscreenLayouts = true;
    } else if (
      Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio") &&
      (partial.windowHeightRatio == null || partial.windowHeightRatio < 0.999)
    ) {
      // Leaving Teaching with a restored non-fullscreen ratio must still drop
      // stale 1.0 from the inactive pointer-kind snapshot.
      shouldStripFullscreenLayouts = true;
    }
    if (
      partial.synthesizerStartOctave !== undefined ||
      partial.synthesizerOctaveCount !== undefined
    ) {
      next = {
        ...next,
        synthesizerStartOctave: resolveSynthStartOctave(
          next.synthesizerStartOctave,
          resolveSynthOctaveCount(next.synthesizerOctaveCount),
        ),
      };
    }

    // 5-octave mode uses the same path as the mouse-hide button (mouseVisible).
    const wasWide = isWidePianoOctaveCount(settings.synthesizerOctaveCount);
    const nowWide = isWidePianoOctaveCount(next.synthesizerOctaveCount);
    if (nowWide) {
      if (next.mouseVisible) {
        get().pushRestore("widePiano", {
          mouseVisible: settings.mouseVisible,
        });
        next = { ...next, mouseVisible: false };
      }
    } else if (wasWide && partial.synthesizerOctaveCount !== undefined) {
      const restore = get().popRestore("widePiano");
      if (
        restore?.mouseVisible !== undefined &&
        partial.mouseVisible === undefined
      ) {
        next = { ...next, mouseVisible: restore.mouseVisible };
      }
    }

    // Focus mode: keep mouse panel hidden (OS cursor stays visible).
    if (get().focusModeActive && next.mouseVisible) {
      get().pushRestore("focusMode", {
        mouseVisible: settings.mouseVisible,
      });
      next = { ...next, mouseVisible: false };
    }

    const leavingSynthesizer =
      partial.keyboardSectionMode !== undefined &&
      partial.keyboardSectionMode !== "synthesizer" &&
      get().musicTeachingEnabled;
    if (leavingSynthesizer) {
      const teachingPatch = get().popRestore("teaching");
      const modeBefore = teachingPatch?.mode;
      const heightBefore = teachingPatch?.windowHeightRatio ?? null;
      set({
        musicTeachingEnabled: false,
        musicNoteIndex: 0,
        musicPlaybackActive: false,
        ...emptyLanguageLessonState(),
      });
      // Restore saved typing mode + height when Teaching exits via keyboardSectionMode.
      if (modeBefore === "mic") {
        next = { ...next, focusModeOverride: true, micMode: true };
      } else if (modeBefore === "focus") {
        next = { ...next, focusModeOverride: true, micMode: false };
      } else if (modeBefore === "normal") {
        next = { ...next, focusModeOverride: false, micMode: false };
      }
      if (heightBefore !== null) {
        const restored = heightRatioAfterLeavingTeaching(heightBefore);
        if (restored === undefined) {
          delete next.windowHeightRatio;
        } else {
          next = { ...next, windowHeightRatio: restored };
        }
        shouldStripFullscreenLayouts = true;
      }
    }

    if (shouldStripFullscreenLayouts) {
      next = stripFullscreenHeightFromLayoutSnapshots(next);
    }

    if (partialContainsLayoutFields(partial) || shouldStripFullscreenLayouts) {
      next = persistLayoutForKind(next, get().pointerInputKind);
    }


    if (get().settingsEpoch !== epoch) {
      return;
    }
    set({ settings: next });
    if (partial.keyboardSectionMode === "synthesizer") {
      await get().stopDictation();
    }
    if (syncToSystem && typingLanguageChanged) {
      // Soft CommandResult — does not throw; must check success or the UI
      // optimistically flips language and never surfaces a toast.
      storeFlags.typingLanguageSwitchInFlight = true;
      try {
        const method = get().inputMethods.find(
          (m) => m.langTag === partial.typingLanguage,
        );
        const result = await invoke<CommandResult>("cmd_set_system_language", {
          language: partial.typingLanguage!,
          klid: method?.klid ?? null,
        });
        if (!result.success) {
          if (get().settingsEpoch === epoch) {
            set({
              settings: {
                ...get().settings,
                typingLanguage: previousTypingLanguage,
              },
            });
          }
          const message = result.error?.trim() || LANGUAGE_CHANGE_FALLBACK;
          storeFlags.lastAnnouncedError = message;
          notify.error(message, { id: "typing-language-switch" });
          return;
        }
        storeFlags.lastAnnouncedError = null;
        await get().refreshLayoutKeyLabels();
      } catch (error) {
        if (get().settingsEpoch === epoch) {
          set({
            settings: {
              ...get().settings,
              typingLanguage: previousTypingLanguage,
            },
          });
        }
        const message =
          error instanceof Error
            ? error.message
            : String(error || LANGUAGE_CHANGE_FALLBACK);
        storeFlags.lastAnnouncedError = message;
        notify.error(message, { id: "typing-language-switch" });
        return;
      } finally {
        storeFlags.typingLanguageSwitchInFlight = false;
      }
    }
    if (get().settingsEpoch !== epoch) {
      return;
    }
    const persisted = await persistSettingsIfCurrent(
      get,
      epoch,
      get().settings,
    );
    if (!persisted) {
      return;
    }
    await emit(PROFILE_UPDATED_EVENT, {
      source: WebviewWindow.getCurrent().label,
    });
    if (typingLanguageChanged) {
      await get().stopDictation();
      void invoke("cmd_reset_layout_compose_state", {
        hkl: get().physicalKeyState.systemHkl || null,
      });
      set({ typedBuffer: "", ...clearGreekPendingAccent() });
      commitSuggestionList(set, []);
      await get().refreshSttCapability();
    }
    if (partial.groqApiKey !== undefined) {
      await get().refreshSttCapability();
    }
    if (uiLanguageChanged) {
      set({ typedBuffer: "", ...clearGreekPendingAccent() });
      commitSuggestionList(set, []);
      await get().loadSuggestions();
    }
    if (
      partial.predictionEnabled !== undefined ||
      partial.suggestionsVisible !== undefined
    ) {
      await get().loadSuggestions();
    }
    if (
      partial.inputPreviewVisible !== undefined ||
      partial.inputPreviewFocusModeVisible !== undefined
    ) {
      await syncInputPreviewEnabled(get);
    }
    if (WebviewWindow.getCurrent().label === "main") {
      const current = get().settings;
      // Transparent is CSS-only; do not trigger mini layout refresh/animation.
      const focusModeSettingChanged =
        partial.focusModeOverride !== undefined ||
        partial.micMode !== undefined;
      if (
        focusModeSettingChanged ||
        partial.accessibilityMonitorId !== undefined
      ) {
        await refreshFocusModeStateHelper(get, set, { animate: true });
        // Monitor moves (and Teaching→Normal height/section patches) must still
        // re-apply non-focus layout when refresh is a no-op with Focus already off.
        if (
          shouldSyncNonFocusWindowLayout({
            focusModeActive: get().focusModeActive,
            accessibilityMonitorIdInPatch:
              partial.accessibilityMonitorId !== undefined,
            windowHeightRatioInPatch: Object.prototype.hasOwnProperty.call(
              partial,
              "windowHeightRatio",
            ),
            keyboardSectionModeInPatch:
              partial.keyboardSectionMode !== undefined,
          })
        ) {
          await syncWindowLayoutFromSettings(
            get().settings,
            true,
            get().musicTeachingEnabled,
          );
        }
      } else if (get().focusModeActive) {
        if (
          partial.collapsed !== undefined ||
          Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")
        ) {
          if (
            Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")
          ) {
            storeFlags.liveHeightRatioPreview = null;
          }
          await syncFocusModeWindowLayout(get, set, true);
        }
      } else if (
        partial.accessibilityMonitorId !== undefined ||
        partial.collapsed !== undefined ||
        Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")
      ) {
        if (
          Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")
        ) {
          storeFlags.liveHeightRatioPreview = null;
        }
        const layoutArgs = {
          monitorId: current.accessibilityMonitorId,
          collapsed: current.collapsed,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(
            current,
            get().musicTeachingEnabled,
          ),
          fullWorkArea: teachingFullWorkAreaActive(
            current,
            get().musicTeachingEnabled,
          ),
        };
        logLayoutIpc("cmd_apply_window_layout", layoutArgs);
        await invoke("cmd_apply_window_layout", layoutArgs);
      }
    }
  },
  setPointerInputKind: async (kind) => {
    // Settings/tool windows must not persist pointer-kind layout swaps (#299).
    if (WebviewWindow.getCurrent().label !== "main") {
      return;
    }
    const { pointerInputKind, settings, profileHydrated } = get();
    if (kind === pointerInputKind) {
      return;
    }
    const epoch = get().settingsEpoch;
    const next = switchPointerInputKindLayout(settings, pointerInputKind, kind);
    set({ pointerInputKind: kind, settings: next });
    if (profileHydrated) {
      await persistSettingsIfCurrent(get, epoch, next);
    }
    if (get().focusModeActive) {
      void syncFocusModeWindowLayout(get, set, true);
    } else {
      void syncWindowLayoutFromSettings(
        next,
        true,
        get().musicTeachingEnabled,
      );
    }
  },
  handlePointerInputEvent: (input) => {
    // Only the main keyboard window owns pointer-kind tracking (#299).
    if (WebviewWindow.getCurrent().label !== "main") {
      return;
    }
    const nowMs = performance.now();
    const kind = pointerKindFromEvent(input, {
      lastTouchAtMs: storeFlags.lastTouchPointerAtMs,
      nowMs,
    });
    if (kind === null) {
      return;
    }
    if (kind === "touch") {
      storeFlags.lastTouchPointerAtMs = nowMs;
    }
    if (kind === get().pointerInputKind) {
      // Alternating back to the current kind cancels a pending switch.
      if (storeFlags.pointerInputKindDebounceTimer !== null) {
        clearTimeout(storeFlags.pointerInputKindDebounceTimer);
        storeFlags.pointerInputKindDebounceTimer = null;
        storeFlags.pendingPointerInputKind = null;
      }
      return;
    }
    storeFlags.pendingPointerInputKind = kind;
    if (storeFlags.pointerInputKindDebounceTimer !== null) {
      clearTimeout(storeFlags.pointerInputKindDebounceTimer);
    }
    storeFlags.pointerInputKindDebounceTimer = setTimeout(() => {
      storeFlags.pointerInputKindDebounceTimer = null;
      const next = storeFlags.pendingPointerInputKind;
      storeFlags.pendingPointerInputKind = null;
      if (next !== null) {
        void get().setPointerInputKind(next);
      }
    }, POINTER_INPUT_KIND_DEBOUNCE_MS);
  },
  resetSettingsToDefaults: async () => {
    const { monitors } = get();
    const uiLanguage = await invoke<string>("cmd_get_windows_ui_language");
    await get().updateSettings(buildDefaultSettings(monitors, uiLanguage));
  },
  wipeActiveProfile: async () => {
    await invoke("cmd_wipe_active_profile");
    set({
      typedBuffer: "",
      ...clearGreekPendingAccent(),
      stickyModifiers: [],
    });
    await loadProfileData(set, get, { animateLayout: true });
    await get().loadSuggestions();
  },
  loadMonitors: async () => {
    const monitors = await invoke<MonitorInfo[]>("cmd_list_monitors");
    set({ monitors });
    if (WebviewWindow.getCurrent().label === "main" && get().profileHydrated) {
      await refreshFocusModeStateHelper(get, set, { animate: false });
    }
  },
  saveActiveProfile: async () => {
    await invoke("cmd_save_active_profile_file");
    await emit(PROFILE_UPDATED_EVENT, {
      source: WebviewWindow.getCurrent().label,
    });
  },
  pickBackgroundImage: async () => {
    const path = await invoke<string | null>("cmd_pick_background_image");
    if (path) {
      await get().updateSettings({ backgroundImagePath: path });
    }
  },
});
