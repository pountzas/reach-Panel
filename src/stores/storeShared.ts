import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  INTERNAL_PROFILE_ID,
  MonitorInfo,
} from "../lib/types";
import {
  isWidePianoOctaveCount,
  resolveSynthOctaveCount,
  resolveSynthStartOctave,
} from "../lib/music/octaveCount";
import { resolveColorProfile } from "../lib/colorProfiles";
import { afterNextPaint, MOTION, prefersReducedMotion } from "../lib/motion";
import { notify } from "../lib/notify";
import { resolveSectionStack } from "../lib/sectionStack";
import {
  isInputPreviewActiveForMode,
  resolveFocusModeEnabled,
} from "../lib/focusMode";
import { migrateLegacyFocusModeSettingsKeys } from "../lib/focusModeSettingsMigration";
import { showDictationOverlay } from "../lib/dictationOverlayWindow";
import {
  closeToolWindow,
  openToolWindow,
  resolveMonitor,
  syncMainForToolWindows,
  TOOL_WINDOW_REQUEST_EVENT,
  TOOL_WINDOW_TITLES,
  type ToolWindowLabel,
} from "../lib/toolWindows";
import {
  coercePersistedKeyboardSectionMode,
  hydrateKeyboardSectionMode,
  isTeachingSessionActive,
  needsKeyboardSectionModeMigration,
  settingsForPersist,
  teachingSessionKeyboardMode,
  TEACHING_SESSION_EVENT,
  type TeachingSessionPayload,
} from "../lib/appModeLayout";
import {
  commitSuggestionList,
  suggestionSuffixAfterPrefix,
} from "./lib/suggestionMerge";
import {
  freeWriteModeFromState,
  languageLessonModeFromState,
  teachingFullWorkAreaActive,
} from "./lib/teachingVisibility";
import {
  clearGreekPendingAccent,
  emptyLanguageLessonState,
  initLanguageLessonState,
  teachingPdfFileName,
} from "./lib/teachingLessonState";
import { greekComposeContextFromState } from "./lib/greekComposeFromState";
import { physicalKeyStateEqual } from "./lib/physicalKeyStateEqual";
import {
  heightRatioFromSettings,
  syncWindowLayoutFromSettings,
  windowLayoutInvokeArgs,
} from "./lib/windowLayoutArgs";
import type { AppStore } from "./types";
import { storeFlags } from "./storeFlags";

export {
  commitSuggestionList,
  suggestionSuffixAfterPrefix,
  freeWriteModeFromState,
  languageLessonModeFromState,
  teachingFullWorkAreaActive,
  clearGreekPendingAccent,
  emptyLanguageLessonState,
  initLanguageLessonState,
  teachingPdfFileName,
  greekComposeContextFromState,
  physicalKeyStateEqual,
  heightRatioFromSettings,
  syncWindowLayoutFromSettings,
  windowLayoutInvokeArgs,
};

/** Drop Teaching-sourced prefix + chips so they can't be applied to another target. */
export function dropTeachingSuggestionPrefix(
  set: (partial: { typedBuffer?: string; suggestions?: string[] }) => void,
): void {
  storeFlags.suggestionsRequestId += 1;
  commitSuggestionList(set, []);
  set({ typedBuffer: "" });
}

/** storeFlags.lastAnnouncedError → storeFlags */

export async function startCompanionBridge(): Promise<void> {
  await invoke("cmd_companion_start", { port: null });
}

export async function stopCompanionBridge(): Promise<void> {
  try {
    await invoke("cmd_companion_stop");
  } catch {
    // Already stopped or never started.
  }
}

/** typing/suggestions flags → storeFlags */

/** window/focus layout flags → storeFlags */

let focusContentAnimWaiter: {
  resolve: () => void;
  promise: Promise<void>;
} | null = null;

export function beginFocusContentAnimWait(): Promise<void> {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  focusContentAnimWaiter = { resolve, promise };
  return promise;
}

export function peekOrBeginFocusContentAnimWait(): Promise<void> {
  if (focusContentAnimWaiter) {
    return focusContentAnimWaiter.promise;
  }
  return beginFocusContentAnimWait();
}

export function notifyFocusContentAnimDone(): void {
  const w = focusContentAnimWaiter;
  focusContentAnimWaiter = null;
  w?.resolve();
}

/** Coalesce rapid touch↔mouse pointerdowns before switching layout profiles. */
export const POINTER_INPUT_KIND_DEBOUNCE_MS = 50;

type SyncFocusLayoutOptions = {
  /**
   * Caller already set `isAnimatingWindow` (same React turn as visibility) so the
   * shell does not paint a gap frame. Skip the re-entrancy early-return.
   */
  continueHeld?: boolean;
};

/**
 * Show: resize once, then start content enter and wait for CSS. Hide: wait for exit, then resize.
 * Always ends aligned with the latest `focusModeKeyboardVisible` (no squashed keyboard in FAB).
 */
export async function syncFocusModeWindowLayout(
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
  preferAnimate = true,
  options?: SyncFocusLayoutOptions,
) {
  const state = get();
  if (!state.focusModeActive) {
    storeFlags.pendingFocusLayoutSync = null;
    return;
  }
  // continueHeld bypasses isAnimatingWindow so callers can set it same-turn as
  // visibility; in-flight still serializes so parallel syncs cannot squash layout.
  if (storeFlags.focusLayoutSyncInFlight || (state.isAnimatingWindow && !options?.continueHeld)) {
    storeFlags.pendingFocusLayoutSync = preferAnimate;
    return;
  }

  const visibleAtStart = state.focusModeKeyboardVisible;
  const animateContent = preferAnimate && !prefersReducedMotion();
  storeFlags.focusLayoutSyncInFlight = true;
  if (!state.isAnimatingWindow) {
    set({ isAnimatingWindow: true });
  }
  try {
    const { settings } = get();
    const sharedHeightRatio = heightRatioFromSettings(
      settings,
      get().musicTeachingEnabled,
      true,
    );
    const args = {
      monitorId: settings.accessibilityMonitorId,
      collapsed: !visibleAtStart,
      collapsedDictation: settings.micMode === true,
      collapsedSettings: true,
      heightRatio: sharedHeightRatio,
      focusMode: true,
      focusKeyboardVisible: visibleAtStart,
      focusKeyboardHeightRatio: sharedHeightRatio,
      fullWorkArea: false,
    };

    if (visibleAtStart) {
      // FAB must paint hidden before bounds grow, or the last FAB frame stretches
      // across the keyboard strip (top-left blink).
      await afterNextPaint();
      if (get().focusModeKeyboardVisible !== visibleAtStart) {
        return; // finally re-syncs to the latest visibility
      }
      await invoke("cmd_apply_window_layout", args);
      if (animateContent) {
        const wait = beginFocusContentAnimWait();
        set({ focusContentAnim: "enter" });
        await Promise.race([
          wait,
          new Promise<void>((r) =>
            window.setTimeout(r, MOTION.focusKeyboard + 80),
          ),
        ]);
        set({ focusContentAnim: "idle" });
      }
    } else {
      if (animateContent) {
        const wait = peekOrBeginFocusContentAnimWait();
        if (get().focusContentAnim !== "exit") {
          set({ focusContentAnim: "exit" });
        }
        await Promise.race([
          wait,
          new Promise<void>((r) =>
            window.setTimeout(r, MOTION.focusKeyboard + 80),
          ),
        ]);
        set({ focusContentAnim: "idle" });
      }
      // Keyboard must paint gone before bounds shrink into the FAB corner.
      if (get().focusModeKeyboardVisible !== visibleAtStart) {
        return; // finally re-syncs to the latest visibility
      }
      await afterNextPaint();
      if (get().focusModeKeyboardVisible !== visibleAtStart) {
        return; // finally re-syncs to the latest visibility
      }
      await invoke("cmd_apply_window_layout", args);
    }
    if (get().dictationState !== "idle") {
      void showDictationOverlay();
    }
  } finally {
    storeFlags.focusLayoutSyncInFlight = false;
    set({ isAnimatingWindow: false, focusContentAnim: "idle" });
    const latest = get();
    const queued = storeFlags.pendingFocusLayoutSync;
    storeFlags.pendingFocusLayoutSync = null;
    if (
      latest.focusModeActive &&
      (queued !== null || latest.focusModeKeyboardVisible !== visibleAtStart)
    ) {
      const nextAnimate = queued ?? preferAnimate;
      void syncFocusModeWindowLayout(get, set, nextAnimate);
    }
  }
}

/**
 * Expand collapsed / mini FAB so UpdatePrompt has a usable window size.
 * Waits out in-flight window animation so expand/uncollapse is not no-op'd.
 */
export async function waitForWindowAnimationIdle(
  get: () => AppStore,
  timeoutMs = 4000,
): Promise<void> {
  const started = Date.now();
  while (get().isAnimatingWindow) {
    if (Date.now() - started >= timeoutMs) return;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 32);
    });
  }
}

export async function ensureUpdatePromptVisible(get: () => AppStore) {
  await waitForWindowAnimationIdle(get);
  const state = get();
  if (state.focusModeActive) {
    if (!state.focusModeKeyboardVisible) {
      await state.expandFocusModeKeyboard();
      // Animation may have started after we checked; retry once if expand no-op'd.
      if (!get().focusModeKeyboardVisible) {
        await waitForWindowAnimationIdle(get);
        if (!get().focusModeKeyboardVisible) {
          await get().expandFocusModeKeyboard();
        }
      }
    }
    return;
  }
  if (state.settings.collapsed) {
    await state.toggleCollapsed();
    if (get().settings.collapsed) {
      await waitForWindowAnimationIdle(get);
      if (get().settings.collapsed) {
        await get().toggleCollapsed();
      }
    }
  }
}

/**
 * Keep focusModeActive / mouseVisible in sync with settings + monitors.
 * Enter: hide mouse panel (session restore on exit). Leave: restore layout.
 */
export async function refreshFocusModeStateHelper(
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
  options?: { animate?: boolean },
) {
  const state = get();
  const { settings, monitors, focusModeActive: wasActive } = state;
  const teachingActive =
    state.musicTeachingEnabled &&
    settings.keyboardSectionMode === "synthesizer";
  const enabled =
    monitors.length > 0 &&
    resolveFocusModeEnabled(settings, monitors, teachingActive);
  const animate = options?.animate !== false;

  if (enabled && !wasActive) {
    const mouseBefore = settings.mouseVisible;
    get().pushRestore(
      "focusMode",
      { mouseVisible: mouseBefore },
      { replace: true },
    );
    set({
      focusModeActive: true,
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusModeSuppressAutoShow: false,
      settings: mouseBefore ? { ...settings, mouseVisible: false } : settings,
    });
    await syncFocusModeWindowLayout(get, set, animate);
  } else if (!enabled && wasActive) {
    const restore = get().popRestore("focusMode");
    const nextSettings =
      restore?.mouseVisible !== undefined
        ? { ...settings, mouseVisible: restore.mouseVisible }
        : settings;
    set({
      focusModeActive: false,
      focusModeKeyboardVisible: false,
      focusModeManualExpand: false,
      focusModeSuppressAutoShow: false,
      settings: nextSettings,
    });
    await syncWindowLayoutFromSettings(
      nextSettings,
      animate,
      get().musicTeachingEnabled,
    );
  } else if (enabled) {
    // Still active: enforce mouse panel hidden and keep window layout in sync.
    if (settings.mouseVisible) {
      get().pushRestore("focusMode", {
        mouseVisible: true,
      });
      set({
        settings: { ...settings, mouseVisible: false },
      });
    }
    await syncFocusModeWindowLayout(get, set, animate);
  }

  await syncInputPreviewEnabled(get);
}

export const LANGUAGE_CHANGE_FALLBACK =
  "Could not switch keyboard language.";





export function parseSettings(json: string): AppSettings {
  try {
    const rawParsed = JSON.parse(json) as Record<string, unknown>;
    const migrated = migrateLegacyFocusModeSettingsKeys(rawParsed);
    const {
      theme,
      mouseSide,
      language: legacyLanguage,
      onscreenLayout: _legacyOnscreenLayout,
      // Removed v1 UI prefs — ignore so old profiles still load.
      quickActionsVisible: _quickActionsVisible,
      phrasesVisible: _phrasesVisible,
      largeHeaders: _largeHeaders,
      headTrackingEnabled: _headTrackingEnabled,
      emergencyVisible: _emergencyVisible,
      precisionMode: _precisionMode,
      ...parsed
    } = migrated as Partial<AppSettings> & {
      theme?: unknown;
      mouseSide?: "left" | "right" | "floating";
      language?: string;
      /** Removed: on-screen layout always follows Windows. */
      onscreenLayout?: string;
      quickActionsVisible?: unknown;
      phrasesVisible?: unknown;
      largeHeaders?: unknown;
      headTrackingEnabled?: unknown;
      emergencyVisible?: unknown;
      precisionMode?: unknown;
    };
    void _quickActionsVisible;
    void _phrasesVisible;
    void _largeHeaders;
    void _headTrackingEnabled;
    void _emergencyVisible;
    void _precisionMode;
    const colorProfile = resolveColorProfile({ ...parsed, theme });
    const mousePanelSide =
      parsed.mousePanelSide ??
      (mouseSide === "left" ? "left" : DEFAULT_SETTINGS.mousePanelSide);
    const typingLanguage =
      parsed.typingLanguage ??
      legacyLanguage ??
      DEFAULT_SETTINGS.typingLanguage;
    const uiLanguage =
      parsed.uiLanguage ?? legacyLanguage ?? DEFAULT_SETTINGS.uiLanguage;
    // Older profile files may omit keys that previously defaulted to "on".
    // Keep that behavior for existing installs; new profiles write explicit values.
    // suggestionsVisible and predictionEnabled are toggled together in Settings.
    const legacyFill: Partial<AppSettings> = {
      predictionEnabled:
        parsed.predictionEnabled ?? parsed.suggestionsVisible ?? true,
      suggestionsVisible: parsed.suggestionsVisible ?? true,
      dictationVisible: parsed.dictationVisible ?? true,
      showTeachingInputHelpers: parsed.showTeachingInputHelpers ?? true,
      inputPreviewVisible: parsed.inputPreviewVisible ?? true,
      inputPreviewFocusModeVisible: parsed.inputPreviewFocusModeVisible ?? true,
      keyboardModeToggleVisible: parsed.keyboardModeToggleVisible ?? true,
    };
    // Focus Auto dropped: null / missing override → Normal (false).
    const focusModeOverride = parsed.focusModeOverride === true ? true : false;
    const micMode = focusModeOverride && parsed.micMode === true;
    // Teaching is session-only; never hydrate synthesizer under Normal/Focus.
    const keyboardSectionMode = coercePersistedKeyboardSectionMode(
      parsed.keyboardSectionMode,
      false,
    );
    const taskbarPositionPreference =
      parsed.taskbarPositionPreference === "top" ? "top" : "bottom";
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ...legacyFill,
      typingLanguage,
      uiLanguage,
      colorProfile,
      mousePanelSide,
      focusModeOverride,
      micMode,
      keyboardSectionMode,
      taskbarPositionPreference,
      sectionStack: resolveSectionStack(parsed.sectionStack),
      synthesizerOctaveCount: resolveSynthOctaveCount(
        parsed.synthesizerOctaveCount,
      ),
      synthesizerStartOctave: resolveSynthStartOctave(
        parsed.synthesizerStartOctave,
        resolveSynthOctaveCount(parsed.synthesizerOctaveCount),
      ),
      // 5-octave mode always uses the mouse-hide setting path.
      ...(isWidePianoOctaveCount(parsed.synthesizerOctaveCount)
        ? { mouseVisible: false }
        : {}),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function buildDefaultSettings(
  monitors: MonitorInfo[],
  uiLanguage: string = DEFAULT_SETTINGS.uiLanguage,
): AppSettings {
  const primary = monitors.find((m) => m.is_primary) ?? monitors[0];
  return {
    ...DEFAULT_SETTINGS,
    uiLanguage,
    accessibilityMonitorId:
      primary?.id ?? DEFAULT_SETTINGS.accessibilityMonitorId,
  };
}

const TOOL_WINDOW_FLAG: Record<ToolWindowLabel, "showSettings"> = {
  settings: "showSettings",
};

export async function setToolWindowVisible(
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
  label: ToolWindowLabel,
  show: boolean,
) {
  // Child webviews must not open/close tools themselves: destroy → syncMain
  // listeners would die with that webview (e.g. Settings opening Macro Builder).
  if (WebviewWindow.getCurrent().label !== "main") {
    await emit(TOOL_WINDOW_REQUEST_EVENT, { label, show });
    return;
  }

  const flag = TOOL_WINDOW_FLAG[label];
  if (show) {
    try {
      const monitors = get().monitors;
      const preferred = resolveMonitor(
        monitors,
        get().settings.accessibilityMonitorId,
      );
      await openToolWindow(label, {
        title: TOOL_WINDOW_TITLES[label],
        monitor: preferred,
        onDestroyed: () => {
          set({ [flag]: false });
          void syncMainForToolWindows();
          void get().syncWindowFocusable();
        },
      });
      set({ [flag]: true });
    } catch (error) {
      set({ [flag]: false });
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
    void syncMainForToolWindows();
    void get().syncWindowFocusable();
    return;
  }

  set({ [flag]: false });
  await closeToolWindow(label);
  void syncMainForToolWindows();
  void get().syncWindowFocusable();
}

export async function syncInputPreviewEnabled(get: () => AppStore): Promise<void> {
  if (WebviewWindow.getCurrent().label !== "main") {
    return;
  }
  const { settings, focusModeActive, musicTeachingEnabled } = get();
  const teachingSessionActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  await invoke("cmd_set_input_preview_enabled", {
    enabled:
      !teachingSessionActive &&
      isInputPreviewActiveForMode(settings, focusModeActive),
  });
}

export async function loadProfileData(
  set: (partial: Partial<AppStore>) => void,
  get: () => AppStore,
  options?: { animateLayout?: boolean },
) {
  const profiles =
    await invoke<{ id: string; settings_json: string }[]>("cmd_get_profiles");
  const active =
    profiles.find((p) => p.id === INTERNAL_PROFILE_ID) ?? profiles[0];
  let migratedFocusAuto = false;
  let migratedKeyboardSectionMode = false;
  if (active) {
    try {
      const raw = JSON.parse(active.settings_json) as {
        focusModeOverride?: unknown;
        miniModeOverride?: unknown;
        keyboardSectionMode?: unknown;
      };
      const override =
        raw.focusModeOverride !== undefined
          ? raw.focusModeOverride
          : raw.miniModeOverride;
      migratedFocusAuto = override == null;
      migratedKeyboardSectionMode = needsKeyboardSectionModeMigration(
        raw.keyboardSectionMode,
        get().musicTeachingEnabled,
      );
    } catch {
      migratedFocusAuto = false;
      migratedKeyboardSectionMode = false;
    }
  }
  const parsed = active
    ? parseSettings(active.settings_json)
    : DEFAULT_SETTINGS;
  const settings = {
    ...parsed,
    keyboardSectionMode: hydrateKeyboardSectionMode(
      parsed.keyboardSectionMode,
      get().musicTeachingEnabled,
    ),
  };
  set({ settings, settingsEpoch: get().settingsEpoch + 1 });
  const isMainWindow = WebviewWindow.getCurrent().label === "main";
  if (isMainWindow) {
    await invoke("cmd_set_system_language", {
      language: settings.typingLanguage,
    });
    await get().pollKeyboardState();
    await syncInputPreviewEnabled(get);
  }
  if (migratedFocusAuto || migratedKeyboardSectionMode) {
    const epoch = get().settingsEpoch;
    await persistSettingsIfCurrent(get, epoch, get().settings);
  }
  if (isMainWindow) {
    await refreshFocusModeStateHelper(get, set, {
      animate: options?.animateLayout === true,
    });
    if (!get().focusModeActive) {
      await syncWindowLayoutFromSettings(
        get().settings,
        options?.animateLayout === true,
        get().musicTeachingEnabled,
      );
    }
  }
}

/** Persist full settings only if this window's profile epoch is still current. */
export async function persistSettingsIfCurrent(
  get: () => AppStore,
  epoch: number,
  settings: AppSettings,
): Promise<boolean> {
  if (!get().profileHydrated || get().settingsEpoch !== epoch) {
    return false;
  }
  await invoke("cmd_update_profile_settings", {
    profileId: INTERNAL_PROFILE_ID,
    settingsJson: JSON.stringify(settingsForPersist(settings)),
  });
  return get().profileHydrated && get().settingsEpoch === epoch;
}

export async function emitTeachingSession(get: () => AppStore): Promise<void> {
  if (WebviewWindow.getCurrent().label !== "main") {
    return;
  }
  const state = get();
  await emit(TEACHING_SESSION_EVENT, {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    keyboardSectionMode: teachingSessionKeyboardMode(
      state.musicTeachingEnabled,
    ),
  } satisfies TeachingSessionPayload);
}
