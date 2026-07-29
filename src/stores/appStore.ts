import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate } from "../lib/updater";
import {
  DEFAULT_PHYSICAL_KEY_STATE,
  PhysicalKeyState,
} from "../lib/keyboardLayouts";
import {
  AppSettings,
  CommandResult,
  DEFAULT_SETTINGS,
  INTERNAL_PROFILE_ID,
  MacroDef,
  MacroStep,
  MonitorInfo,
  Phrase,
  PhraseCategory,
  ProfileFileInfo,
  QuickAction,
} from "../lib/types";
import { resolveSynthOctaveCount } from "../lib/music/octaveCount";
import { getSongById, songRequiredOctaveCount } from "../lib/music/songs";
import { resolveColorProfile } from "../lib/colorProfiles";
import { notify } from "../lib/notify";
import { isStickySpeechError } from "../lib/speechPrivacy";
import { clampWindowHeightRatio, computeContentHeightRatio } from "../lib/sectionLayouts";
import {
  closeToolWindow,
  openToolWindow,
  PROFILE_UPDATED_EVENT,
  resolveMonitor,
  syncMainForToolWindows,
  TOOL_WINDOW_TITLES,
  type ToolWindowLabel,
} from "../lib/toolWindows";

/** Avoid re-toasting the same backend error until it clears. */
let lastAnnouncedError: string | null = null;

/** Block OS→UI language sync while a typing-language switch is in flight. */
let typingLanguageSwitchInFlight = false;

/** Last live-preview window height ratio (header drag); skips near-duplicate applies. */
let liveHeightRatioPreview: number | null = null;

const LANGUAGE_CHANGE_NO_TARGET_FALLBACK =
  "No target application to switch language. Click into the app you want to type in first.";

function heightRatioFromSettings(settings: AppSettings): number {
  const contentRatio = computeContentHeightRatio({
    quickActions: settings.quickActionsVisible,
    phrases: settings.phrasesVisible,
  });
  if (settings.windowHeightRatio == null) {
    return contentRatio;
  }
  return Math.max(contentRatio, clampWindowHeightRatio(settings.windowHeightRatio));
}

async function syncWindowLayoutFromSettings(
  settings: AppSettings,
  preferAnimate: boolean,
) {
  const args = {
    monitorId: settings.accessibilityMonitorId,
    collapsed: settings.collapsed,
    collapsedDictation:
      settings.collapsed && settings.dictationVisible !== false,
    heightRatio: heightRatioFromSettings(settings),
  };
  // Animate height like phrases/QA toggles; apply for collapsed / cold load.
  if (preferAnimate && !settings.collapsed) {
    await invoke("cmd_animate_window_layout", args);
  } else {
    await invoke("cmd_apply_window_layout", args);
  }
}

export type DictationState = "idle" | "listening" | "processing";

export interface SttCapability {
  engine: "winrt" | "whisper" | null;
  whisperReady: boolean;
  whisperDownloading: boolean;
  winrtSupported: boolean;
  online: boolean;
  canDictate: boolean;
}

interface AppStore {
  profileFiles: ProfileFileInfo[];
  activeProfileFile: string | null;
  settings: AppSettings;
  monitors: MonitorInfo[];
  quickActions: QuickAction[];
  phrases: Phrase[];
  phraseCategories: PhraseCategory[];
  macros: MacroDef[];
  suggestions: string[];
  typedBuffer: string;
  stickyModifiers: string[];
  physicalKeyState: PhysicalKeyState;
  lastError: string | null;
  dictationState: DictationState;
  sttCapability: SttCapability | null;
  showSettings: boolean;
  showMacroBuilder: boolean;
  showHeadTrackingWizard: boolean;
  keyboardLayout: string;
  /** Session-only: guided piano teaching replaces Phrases while on. */
  musicTeachingEnabled: boolean;
  musicSongId: string | null;
  musicNoteIndex: number;
  /** Session-only: demo playback of the selected song. */
  musicPlaybackActive: boolean;
  phrasesVisibleBeforeTeaching: boolean | null;
  loadProfileFiles: () => Promise<void>;
  setProfileFile: (filename: string) => Promise<void>;
  createProfileFile: (filename: string, name: string) => Promise<void>;
  deleteProfileFile: (filename: string) => Promise<void>;
  updateSettings: (
    partial: Partial<AppSettings>,
    options?: { syncToSystem?: boolean },
  ) => Promise<void>;
  /** Live-preview OS window height while dragging the main header (no persist). */
  applyWindowHeightRatioLive: (ratio: number) => Promise<void>;
  resetSettingsToDefaults: () => Promise<void>;
  wipeActiveProfile: () => Promise<void>;
  loadMonitors: () => Promise<void>;
  loadQuickActions: () => Promise<void>;
  loadPhrases: () => Promise<void>;
  loadMacros: () => Promise<void>;
  saveActiveProfile: () => Promise<void>;
  pickBackgroundImage: () => Promise<void>;
  setTypedBuffer: (text: string) => void;
  appendTyped: (ch: string) => void;
  backspaceTyped: () => void;
  toggleSticky: (modifier: string) => void;
  pollKeyboardState: () => Promise<void>;
  toggleLanguage: () => Promise<void>;
  clearSticky: () => void;
  clearStickyExceptFn: () => void;
  loadSuggestions: () => Promise<void>;
  applySuggestion: (word: string) => Promise<void>;
  setLastError: (error: string | null) => void;
  pollError: () => Promise<void>;
  setDictationState: (state: DictationState) => void;
  setSttCapability: (capability: SttCapability | null) => void;
  refreshSttCapability: () => Promise<void>;
  ensureWhisperModel: () => Promise<void>;
  toggleDictation: () => Promise<void>;
  stopDictation: () => Promise<void>;
  setShowSettings: (show: boolean) => void;
  setShowMacroBuilder: (show: boolean) => void;
  setShowHeadTrackingWizard: (show: boolean) => void;
  syncWindowFocusable: () => Promise<void>;
  loadKeyboardLayout: () => Promise<void>;
  toggleCollapsed: () => Promise<void>;
  enableMusicTeaching: () => Promise<void>;
  disableMusicTeaching: (options?: { hidePhrases?: boolean }) => Promise<void>;
  setMusicSongId: (songId: string) => Promise<void>;
  restartMusicLesson: () => void;
  reportMusicKeyPlayed: (keyId: string) => void;
  startMusicPlayback: () => void;
  stopMusicPlayback: () => void;
  setMusicPlaybackNoteIndex: (index: number) => void;
  finishMusicPlayback: () => void;
  isAnimatingWindow: boolean;
  pendingUpdate: Update | null;
  updateCheckStatus: "idle" | "checking" | "upToDate" | "error";
  setPendingUpdate: (update: Update | null) => void;
  checkForUpdates: () => Promise<void>;
}

function parseSettings(json: string): AppSettings {
  try {
    const { theme, mouseSide, language: legacyLanguage, ...parsed } = JSON.parse(
      json,
    ) as Partial<AppSettings> & {
      theme?: unknown;
      mouseSide?: "left" | "right" | "floating";
      language?: string;
    };
    const colorProfile = resolveColorProfile({ ...parsed, theme });
    const mousePanelSide =
      parsed.mousePanelSide ??
      (mouseSide === "left" ? "left" : DEFAULT_SETTINGS.mousePanelSide);
    const typingLanguage =
      parsed.typingLanguage ?? legacyLanguage ?? DEFAULT_SETTINGS.typingLanguage;
    const uiLanguage = parsed.uiLanguage ?? legacyLanguage ?? DEFAULT_SETTINGS.uiLanguage;
    // Older profile files may omit keys that previously defaulted to "on".
    // Keep that behavior for existing installs; new profiles write explicit values.
    const legacyFill: Partial<AppSettings> = {
      predictionEnabled: parsed.predictionEnabled ?? true,
      quickActionsVisible: parsed.quickActionsVisible ?? true,
      phrasesVisible: parsed.phrasesVisible ?? true,
      suggestionsVisible: parsed.suggestionsVisible ?? true,
      dictationVisible: parsed.dictationVisible ?? true,
      emergencyVisible: parsed.emergencyVisible ?? true,
      keyboardModeToggleVisible: parsed.keyboardModeToggleVisible ?? true,
    };
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ...legacyFill,
      typingLanguage,
      uiLanguage,
      colorProfile,
      mousePanelSide,
      synthesizerOctaveCount: resolveSynthOctaveCount(parsed.synthesizerOctaveCount),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function buildDefaultSettings(
  monitors: MonitorInfo[],
  uiLanguage: string = DEFAULT_SETTINGS.uiLanguage,
): AppSettings {
  const primary = monitors.find((m) => m.is_primary) ?? monitors[0];
  return {
    ...DEFAULT_SETTINGS,
    uiLanguage,
    accessibilityMonitorId: primary?.id ?? DEFAULT_SETTINGS.accessibilityMonitorId,
  };
}

const TOOL_WINDOW_FLAG: Record<
  ToolWindowLabel,
  "showSettings" | "showMacroBuilder" | "showHeadTrackingWizard"
> = {
  settings: "showSettings",
  "macro-builder": "showMacroBuilder",
  "head-tracking": "showHeadTrackingWizard",
};

async function setToolWindowVisible(
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
  label: ToolWindowLabel,
  show: boolean,
) {
  const flag = TOOL_WINDOW_FLAG[label];
  if (show) {
    const { monitors, settings } = get();
    const monitor = resolveMonitor(monitors, settings.accessibilityMonitorId);
    try {
      await openToolWindow(label, {
        title: TOOL_WINDOW_TITLES[label],
        monitor,
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

async function loadProfileData(
  set: (partial: Partial<AppStore>) => void,
  get: () => AppStore,
  options?: { animateLayout?: boolean },
) {
  const profiles = await invoke<{ id: string; settings_json: string }[]>(
    "cmd_get_profiles",
  );
  const active = profiles.find((p) => p.id === INTERNAL_PROFILE_ID) ?? profiles[0];
  const settings = active
    ? parseSettings(active.settings_json)
    : DEFAULT_SETTINGS;
  set({ settings });
  const isMainWindow = WebviewWindow.getCurrent().label === "main";
  if (isMainWindow) {
    await invoke("cmd_set_system_language", { language: settings.typingLanguage });
    await get().pollKeyboardState();
  }
  await get().loadQuickActions();
  await get().loadPhrases();
  await get().loadMacros();
  if (isMainWindow) {
    await syncWindowLayoutFromSettings(
      get().settings,
      options?.animateLayout === true,
    );
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  profileFiles: [],
  activeProfileFile: null,
  settings: DEFAULT_SETTINGS,
  monitors: [],
  quickActions: [],
  phrases: [],
  phraseCategories: [],
  macros: [],
  suggestions: [],
  typedBuffer: "",
  stickyModifiers: [],
  physicalKeyState: DEFAULT_PHYSICAL_KEY_STATE,
  lastError: null,
  dictationState: "idle",
  sttCapability: null,
  showSettings: false,
  showMacroBuilder: false,
  showHeadTrackingWizard: false,
  keyboardLayout: "QWERTY",
  musicTeachingEnabled: false,
  musicSongId: "twinkle",
  musicNoteIndex: 0,
  musicPlaybackActive: false,
  phrasesVisibleBeforeTeaching: null,
  isAnimatingWindow: false,
  pendingUpdate: null,
  updateCheckStatus: "idle",

  setPendingUpdate: (update) => {
    set({ pendingUpdate: update });
    void get().syncWindowFocusable();
  },

  checkForUpdates: async () => {
    set({ updateCheckStatus: "checking" });
    try {
      const update = await checkForUpdate();
      if (update) {
        set({ pendingUpdate: update, updateCheckStatus: "idle" });
      } else {
        set({ pendingUpdate: null, updateCheckStatus: "upToDate" });
      }
    } catch {
      set({ updateCheckStatus: "error" });
    }
    void get().syncWindowFocusable();
  },

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
  },

  setProfileFile: async (filename) => {
    await invoke("cmd_load_profile_file", { filename });
    set({
      activeProfileFile: filename,
      typedBuffer: "",
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
    const nextActive = await invoke<string>("cmd_delete_profile_file", { filename });
    set({
      typedBuffer: "",
      stickyModifiers: [],
      activeProfileFile: nextActive,
    });
    await get().loadProfileFiles();
    await get().loadSuggestions();
  },

  saveActiveProfile: async () => {
    await invoke("cmd_save_active_profile_file");
  },

  pickBackgroundImage: async () => {
    const path = await invoke<string | null>("cmd_pick_background_image");
    if (path) {
      await get().updateSettings({ backgroundImagePath: path });
    }
  },

  updateSettings: async (partial, options) => {
    const { settings } = get();
    const syncToSystem = options?.syncToSystem ?? true;
    const typingLanguageChanged =
      partial.typingLanguage !== undefined &&
      partial.typingLanguage !== settings.typingLanguage;
    const uiLanguageChanged =
      partial.uiLanguage !== undefined && partial.uiLanguage !== settings.uiLanguage;
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

    const leavingSynthesizer =
      partial.keyboardSectionMode !== undefined &&
      partial.keyboardSectionMode !== "synthesizer" &&
      get().musicTeachingEnabled;
    if (leavingSynthesizer) {
      const before = get().phrasesVisibleBeforeTeaching;
      set({
        musicTeachingEnabled: false,
        musicNoteIndex: 0,
        musicPlaybackActive: false,
        phrasesVisibleBeforeTeaching: null,
      });
      if (before !== null) {
        next = { ...next, phrasesVisible: before };
      }
    }

    set({ settings: next });
    if (partial.keyboardSectionMode === "synthesizer") {
      await get().stopDictation();
    }
    if (syncToSystem && typingLanguageChanged) {
      // Soft CommandResult — does not throw; must check success or the UI
      // optimistically flips language and never surfaces a toast.
      typingLanguageSwitchInFlight = true;
      try {
        const result = await invoke<CommandResult>("cmd_set_system_language", {
          language: partial.typingLanguage!,
        });
        if (!result.success) {
          set({
            settings: { ...get().settings, typingLanguage: previousTypingLanguage },
          });
          const message = result.error?.trim() || LANGUAGE_CHANGE_NO_TARGET_FALLBACK;
          lastAnnouncedError = message;
          // Stable id so this toast reappears every failed switch (not only once).
          notify.error(message, { id: "typing-language-no-target" });
          return;
        }
        lastAnnouncedError = null;
      } catch (error) {
        set({
          settings: { ...get().settings, typingLanguage: previousTypingLanguage },
        });
        const message =
          error instanceof Error
            ? error.message
            : String(error || LANGUAGE_CHANGE_NO_TARGET_FALLBACK);
        lastAnnouncedError = message;
        notify.error(message, { id: "typing-language-no-target" });
        return;
      } finally {
        typingLanguageSwitchInFlight = false;
      }
    }
    await invoke("cmd_update_profile_settings", {
      profileId: INTERNAL_PROFILE_ID,
      settingsJson: JSON.stringify(get().settings),
    });
    await emit(PROFILE_UPDATED_EVENT, {
      source: WebviewWindow.getCurrent().label,
    });
    if (typingLanguageChanged) {
      await get().stopDictation();
      set({ typedBuffer: "", suggestions: [] });
    }
    if (uiLanguageChanged) {
      set({ typedBuffer: "", suggestions: [] });
      await get().loadPhrases();
      await get().loadSuggestions();
    }
    {
      const current = get().settings;
      const visibilityChanged =
        partial.phrasesVisible !== undefined ||
        partial.quickActionsVisible !== undefined;
      if (
        partial.accessibilityMonitorId !== undefined ||
        partial.collapsed !== undefined ||
        partial.windowHeightRatio !== undefined ||
        (current.collapsed && partial.dictationVisible !== undefined)
      ) {
        if (partial.windowHeightRatio !== undefined) {
          liveHeightRatioPreview = null;
        }
        await invoke("cmd_apply_window_layout", {
          monitorId: current.accessibilityMonitorId,
          collapsed: current.collapsed,
          collapsedDictation:
            current.collapsed && current.dictationVisible !== false,
          heightRatio: heightRatioFromSettings(current),
        });
      } else if (visibilityChanged && !current.collapsed) {
        await invoke("cmd_animate_window_layout", {
          monitorId: current.accessibilityMonitorId,
          collapsed: false,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(current),
        });
      }
    }
  },

  applyWindowHeightRatioLive: async (ratio) => {
    const { settings } = get();
    if (settings.collapsed) return;
    const heightRatio = Math.max(
      computeContentHeightRatio({
        quickActions: settings.quickActionsVisible,
        phrases: settings.phrasesVisible,
      }),
      clampWindowHeightRatio(ratio),
    );
    if (
      liveHeightRatioPreview !== null &&
      Math.abs(liveHeightRatioPreview - heightRatio) < 0.002
    ) {
      return;
    }
    liveHeightRatioPreview = heightRatio;
    await invoke("cmd_apply_window_layout", {
      monitorId: settings.accessibilityMonitorId,
      collapsed: false,
      collapsedDictation: false,
      heightRatio,
    });
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
      stickyModifiers: [],
    });
    await loadProfileData(set, get, { animateLayout: true });
    await get().loadSuggestions();
  },

  loadMonitors: async () => {
    const monitors = await invoke<MonitorInfo[]>("cmd_list_monitors");
    set({ monitors });
  },

  loadQuickActions: async () => {
    const quickActions = await invoke<QuickAction[]>("cmd_get_quick_actions", {
      profileId: INTERNAL_PROFILE_ID,
    });
    set({ quickActions });
  },

  loadPhrases: async () => {
    const { settings } = get();
    const [phrases, phraseCategories] = await Promise.all([
      invoke<Phrase[]>("cmd_get_phrases", {
        profileId: INTERNAL_PROFILE_ID,
        language: settings.uiLanguage,
      }),
      invoke<PhraseCategory[]>("cmd_get_phrase_categories", {
        profileId: INTERNAL_PROFILE_ID,
      }),
    ]);
    set({ phrases, phraseCategories });
  },

  loadMacros: async () => {
    const macros = await invoke<MacroDef[]>("cmd_get_macros", {
      profileId: INTERNAL_PROFILE_ID,
    });
    set({ macros });
  },

  setTypedBuffer: (text) => set({ typedBuffer: text }),
  appendTyped: (ch) => set((s) => ({ typedBuffer: s.typedBuffer + ch })),
  backspaceTyped: () => set((s) => ({ typedBuffer: s.typedBuffer.slice(0, -1) })),

  toggleSticky: (modifier) =>
    set((s) => ({
      stickyModifiers: s.stickyModifiers.includes(modifier)
        ? s.stickyModifiers.filter((m) => m !== modifier)
        : [...s.stickyModifiers, modifier],
    })),

  pollKeyboardState: async () => {
    const next = await invoke<PhysicalKeyState>("cmd_get_keyboard_state");
    const { physicalKeyState: prev, settings, keyboardLayout } = get();

    const keysUnchanged =
      prev.capsLock === next.capsLock &&
      prev.shift === next.shift &&
      prev.ctrl === next.ctrl &&
      prev.alt === next.alt &&
      prev.win === next.win &&
      prev.pressedVks.length === next.pressedVks.length &&
      prev.pressedVks.every((vk, i) => vk === next.pressedVks[i]);

    // Sync from the focused/target app so Alt+Shift updates our layout.
    // Skip while a language-button switch is in flight.
    const typingLanguageUnchanged =
      typingLanguageSwitchInFlight ||
      settings.typingLanguage === next.systemLanguage;
    const layoutUnchanged = keyboardLayout === next.keyboardLayout;

    if (keysUnchanged && typingLanguageUnchanged && layoutUnchanged) {
      if (prev.hasInputTarget !== next.hasInputTarget) {
        set({ physicalKeyState: next });
      }
      return;
    }

    set({
      physicalKeyState: next,
      keyboardLayout: next.keyboardLayout,
      ...(typingLanguageUnchanged
        ? {}
        : { settings: { ...settings, typingLanguage: next.systemLanguage } }),
    });

    if (!typingLanguageUnchanged) {
      await invoke("cmd_update_profile_settings", {
        profileId: INTERNAL_PROFILE_ID,
        settingsJson: JSON.stringify(get().settings),
      });
      set({ typedBuffer: "", suggestions: [] });
    }
  },

  toggleLanguage: async () => {
    const { settings } = get();
    const next = settings.typingLanguage === "en" ? "el" : "en";
    await get().updateSettings({ typingLanguage: next });
    await get().pollKeyboardState();
  },

  clearSticky: () => set({ stickyModifiers: [] }),

  clearStickyExceptFn: () =>
    set((s) => ({
      stickyModifiers: s.stickyModifiers.filter((m) => m === "fn"),
    })),

  loadSuggestions: async () => {
    const { settings, typedBuffer } = get();
    if (!settings.predictionEnabled) {
      set({ suggestions: [] });
      return;
    }
    const words = typedBuffer.split(/\s+/);
    const prefix = words[words.length - 1] ?? "";
    if (prefix.length < 2) {
      set({ suggestions: [] });
      return;
    }
    const results = await invoke<{ word: string }[]>("cmd_get_suggestions", {
      profileId: INTERNAL_PROFILE_ID,
      prefix,
      language: settings.uiLanguage,
    });
    set({ suggestions: results.map((r) => r.word) });
  },

  applySuggestion: async (word) => {
    const { settings, typedBuffer } = get();
    const parts = typedBuffer.split(/\s+/);
    parts[parts.length - 1] = word;
    const next = parts.join(" ") + " ";
    set({ typedBuffer: next });
    await invoke("cmd_type_text", { text: word + " " });
    await invoke("cmd_record_word", {
      profileId: INTERNAL_PROFILE_ID,
      word,
      language: settings.uiLanguage,
    });
    await get().loadSuggestions();
  },

  setLastError: (error) => {
    if (!error) {
      lastAnnouncedError = null;
      set({ lastError: null });
      return;
    }
    // Sticky overlay for actionable speech errors; everything else → toast.
    if (isStickySpeechError(error)) {
      lastAnnouncedError = error;
      set({ lastError: error });
      return;
    }
    if (lastAnnouncedError === error) {
      return;
    }
    lastAnnouncedError = error;
    notify.error(error);
    set({ lastError: null });
  },
  pollError: async () => {
    const error = await invoke<string | null>("get_last_error");
    get().setLastError(error);
  },

  setDictationState: (state) => set({ dictationState: state }),

  setSttCapability: (capability) => set({ sttCapability: capability }),

  refreshSttCapability: async () => {
    try {
      const status = await invoke<{
        state: DictationState;
        engine: "winrt" | "whisper" | null;
        whisperReady: boolean;
        whisperDownloading: boolean;
        winrtSupported: boolean;
        online: boolean;
        canDictate: boolean;
      }>("cmd_get_stt_status", {
        language: get().settings.typingLanguage,
      });
      set({
        dictationState: status.state,
        sttCapability: {
          engine: status.engine,
          whisperReady: status.whisperReady,
          whisperDownloading: status.whisperDownloading,
          winrtSupported: status.winrtSupported,
          online: status.online,
          canDictate: status.canDictate,
        },
      });
    } catch {
      set({
        sttCapability: {
          engine: null,
          whisperReady: false,
          whisperDownloading: false,
          winrtSupported: false,
          online: false,
          canDictate: false,
        },
      });
    }
  },

  ensureWhisperModel: async () => {
    try {
      set({
        sttCapability: get().sttCapability
          ? { ...get().sttCapability!, whisperDownloading: true }
          : {
              engine: null,
              whisperReady: false,
              whisperDownloading: true,
              winrtSupported: false,
              online: false,
              canDictate: false,
            },
      });
      await invoke("cmd_ensure_whisper_model");
      await get().refreshSttCapability();
    } catch (error) {
      set({
        lastError:
          error instanceof Error ? error.message : String(error),
      });
      await get().refreshSttCapability();
    }
  },

  stopDictation: async () => {
    if (get().dictationState === "idle") return;
    // Optimistic: clear listening UI immediately so the mic toggle feels responsive
    // even when Whisper was mid-transcription (common on Greek / offline path).
    set({ dictationState: "idle" });
    try {
      await invoke("cmd_stop_dictation");
    } catch (error) {
      set({
        lastError:
          error instanceof Error ? error.message : String(error),
      });
    }
  },

  toggleDictation: async () => {
    const { dictationState, settings, sttCapability } = get();
    if (dictationState === "listening" || dictationState === "processing") {
      await get().stopDictation();
      return;
    }
    if (sttCapability && !sttCapability.canDictate) {
      set({
        lastError: sttCapability.winrtSupported
          ? "WHISPER_MODEL: Local speech model is not ready yet."
          : "WHISPER_UNSUPPORTED: Windows speech recognition does not support this language.",
      });
      return;
    }
    try {
      await invoke("cmd_start_dictation", { language: settings.typingLanguage });
      set({ dictationState: "listening" });
      await get().pollError();
      await get().refreshSttCapability();
    } catch (error) {
      set({ dictationState: "idle" });
      set({
        lastError:
          error instanceof Error ? error.message : String(error),
      });
      await get().refreshSttCapability();
    }
  },

  syncWindowFocusable: async () => {
    const needsFocus = get().pendingUpdate !== null;
    await invoke("cmd_set_window_focusable", { focusable: needsFocus });
  },

  setShowSettings: (show) => {
    void setToolWindowVisible(get, set, "settings", show);
  },
  setShowMacroBuilder: (show) => {
    void setToolWindowVisible(get, set, "macro-builder", show);
  },
  setShowHeadTrackingWizard: (show) => {
    void setToolWindowVisible(get, set, "head-tracking", show);
  },

  loadKeyboardLayout: async () => {
    const keyboardLayout = await invoke<string>("cmd_get_keyboard_layout");
    set({ keyboardLayout });
  },

  enableMusicTeaching: async () => {
    const { settings, musicTeachingEnabled, musicSongId } = get();
    if (musicTeachingEnabled) return;
    set({
      musicTeachingEnabled: true,
      phrasesVisibleBeforeTeaching: settings.phrasesVisible,
      musicNoteIndex: 0,
      musicSongId: musicSongId ?? "twinkle",
    });
    const song = getSongById(get().musicSongId);
    const patch: Partial<AppSettings> = {};
    if (!settings.phrasesVisible) {
      patch.phrasesVisible = true;
    }
    if (song) {
      const needed = songRequiredOctaveCount(song);
      const current = resolveSynthOctaveCount(settings.synthesizerOctaveCount);
      if (current < needed) {
        patch.synthesizerOctaveCount = needed;
      }
    }
    if (Object.keys(patch).length > 0) {
      await get().updateSettings(patch);
    }
  },

  disableMusicTeaching: async (options) => {
    if (!get().musicTeachingEnabled && get().phrasesVisibleBeforeTeaching === null) {
      if (options?.hidePhrases) {
        await get().updateSettings({ phrasesVisible: false });
      }
      return;
    }
    const before = get().phrasesVisibleBeforeTeaching;
    set({
      musicTeachingEnabled: false,
      musicNoteIndex: 0,
      musicPlaybackActive: false,
      phrasesVisibleBeforeTeaching: null,
    });
    if (options?.hidePhrases) {
      await get().updateSettings({ phrasesVisible: false });
      return;
    }
    if (before !== null && before !== get().settings.phrasesVisible) {
      await get().updateSettings({ phrasesVisible: before });
    }
  },

  setMusicSongId: async (songId) => {
    const song = getSongById(songId);
    if (!song) return;
    set({ musicSongId: songId, musicNoteIndex: 0, musicPlaybackActive: false });
    const needed = songRequiredOctaveCount(song);
    const current = resolveSynthOctaveCount(get().settings.synthesizerOctaveCount);
    if (current < needed) {
      await get().updateSettings({ synthesizerOctaveCount: needed });
    }
  },

  restartMusicLesson: () => {
    set({ musicNoteIndex: 0, musicPlaybackActive: false });
  },

  reportMusicKeyPlayed: (keyId) => {
    const { musicTeachingEnabled, musicPlaybackActive, musicSongId, musicNoteIndex } =
      get();
    if (!musicTeachingEnabled || musicPlaybackActive) return;
    const song = getSongById(musicSongId);
    if (!song) return;
    if (musicNoteIndex >= song.notes.length) return;
    if (song.notes[musicNoteIndex]?.pitch !== keyId) return;
    set({ musicNoteIndex: musicNoteIndex + 1 });
  },

  startMusicPlayback: () => {
    if (!get().musicTeachingEnabled) return;
    const song = getSongById(get().musicSongId);
    if (!song || song.notes.length === 0) return;
    set({ musicPlaybackActive: true, musicNoteIndex: 0 });
  },

  stopMusicPlayback: () => {
    if (!get().musicPlaybackActive) return;
    set({ musicPlaybackActive: false });
  },

  setMusicPlaybackNoteIndex: (index) => {
    if (!get().musicPlaybackActive) return;
    set({ musicNoteIndex: index });
  },

  finishMusicPlayback: () => {
    if (!get().musicPlaybackActive) return;
    set({ musicPlaybackActive: false, musicNoteIndex: 0 });
  },

  toggleCollapsed: async () => {
    if (get().isAnimatingWindow) {
      return;
    }
    const { settings } = get();
    const collapsed = !settings.collapsed;
    const next = { ...settings, collapsed };

    set({ isAnimatingWindow: true });
    try {
      if (collapsed) {
        set({ settings: next });
        await invoke("cmd_update_profile_settings", {
          profileId: INTERNAL_PROFILE_ID,
          settingsJson: JSON.stringify(next),
        });
        await invoke("cmd_animate_window_layout", {
          monitorId: next.accessibilityMonitorId,
          collapsed: true,
          collapsedDictation: next.dictationVisible !== false,
          heightRatio: heightRatioFromSettings(next),
        });
      } else {
        await invoke("cmd_animate_window_layout", {
          monitorId: settings.accessibilityMonitorId,
          collapsed: false,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(settings),
        });
        set({ settings: next });
        await invoke("cmd_update_profile_settings", {
          profileId: INTERNAL_PROFILE_ID,
          settingsJson: JSON.stringify(next),
        });
      }
    } finally {
      set({ isAnimatingWindow: false });
    }
  },
}));

export async function getMacroSteps(macroId: string): Promise<MacroStep[]> {
  return invoke<MacroStep[]>("cmd_get_macro_steps", { macroId });
}
