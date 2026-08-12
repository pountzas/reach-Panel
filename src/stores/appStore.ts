import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate } from "../lib/updater";
import {
  DEFAULT_PHYSICAL_KEY_STATE,
  type InputMethod,
  type LayoutKeyLabel,
  type PhysicalKeyState,
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
  PointerInputKind,
  ProfileFileInfo,
  QuickAction,
} from "../lib/types";
import {
  isWidePianoOctaveCount,
  resolveSynthOctaveCount,
  resolveSynthStartOctave,
} from "../lib/music/octaveCount";
import { BUILT_IN_SONGS, getSongById, songPianoRangeFit } from "../lib/music/songs";
import type { ImportedMusicSong } from "../lib/music/importTypes";
import {
  parseMusicFilePayload,
  type MusicFilePayload,
} from "../lib/music/parseMusicFile";
import { isImportedMusicSong } from "../lib/music/parseJsonSong";
import { resolveColorProfile } from "../lib/colorProfiles";
import { notify } from "../lib/notify";
import { isStickySpeechError } from "../lib/speechPrivacy";
import { clampWindowHeightRatio, computeContentHeightRatio } from "../lib/sectionLayouts";
import { resolveSectionStack } from "../lib/sectionStack";
import { MINI_KEYBOARD_HEIGHT_RATIO, resolveMiniModeEnabled } from "../lib/miniMode";
import {
  closeToolWindow,
  openToolWindow,
  PROFILE_UPDATED_EVENT,
  resolveMonitor,
  syncMainForToolWindows,
  TOOL_WINDOW_REQUEST_EVENT,
  TOOL_WINDOW_TITLES,
  type ToolWindowLabel,
} from "../lib/toolWindows";
import {
  partialContainsLayoutFields,
  persistLayoutForKind,
  pointerKindFromEvent,
  switchPointerInputKindLayout,
} from "../lib/layoutProfiles";

/** Avoid re-toasting the same backend error until it clears. */
let lastAnnouncedError: string | null = null;

/** Block OS→UI language sync while a typing-language switch is in flight. */
let typingLanguageSwitchInFlight = false;

/** Last live-preview window height ratio (header drag); skips near-duplicate applies. */
let liveHeightRatioPreview: number | null = null;

/** Coalesce live window-resize layout IPC to one apply per animation frame. */
let liveHeightRatioRaf: number | null = null;
let liveHeightRatioPending: number | null = null;
let liveHeightRatioInFlight = false;

/** When a mini layout sync is requested during animation, retry after it finishes. */
let pendingMiniLayoutSync: boolean | null = null;

/** Coalesce rapid touch↔mouse pointerdowns before switching layout profiles. */
const POINTER_INPUT_KIND_DEBOUNCE_MS = 50;
let pendingPointerInputKind: PointerInputKind | null = null;
let pointerInputKindDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Animate mini-mode keyboard show/hide: full-width bottom bar vs 3-FAB stack.
 * Always ends aligned with the latest `miniModeKeyboardVisible` (no squashed keyboard in FAB).
 */
async function syncMiniModeWindowLayout(preferAnimate = true) {
  const state = useAppStore.getState();
  if (!state.miniModeActive) {
    pendingMiniLayoutSync = null;
    return;
  }
  if (state.isAnimatingWindow) {
    pendingMiniLayoutSync = preferAnimate;
    return;
  }

  const visibleAtStart = state.miniModeKeyboardVisible;
  useAppStore.setState({ isAnimatingWindow: true });
  try {
    const { settings } = useAppStore.getState();
    const args = {
      monitorId: settings.accessibilityMonitorId,
      collapsed: !visibleAtStart,
      collapsedDictation: true,
      collapsedSettings: true,
      heightRatio: heightRatioFromSettings(settings),
      miniMode: true,
      miniKeyboardVisible: visibleAtStart,
      miniKeyboardHeightRatio: MINI_KEYBOARD_HEIGHT_RATIO,
    };
    if (preferAnimate) {
      await invoke("cmd_animate_window_layout", args);
    } else {
      await invoke("cmd_apply_window_layout", args);
    }
  } finally {
    useAppStore.setState({ isAnimatingWindow: false });
    const latest = useAppStore.getState();
    const queued = pendingMiniLayoutSync;
    pendingMiniLayoutSync = null;
    // Visibility changed mid-animation, or another sync was requested while busy.
    if (
      latest.miniModeActive &&
      (queued !== null || latest.miniModeKeyboardVisible !== visibleAtStart)
    ) {
      const nextAnimate = queued ?? preferAnimate;
      void syncMiniModeWindowLayout(nextAnimate);
    }
  }
}

/**
 * Expand collapsed / mini FAB so UpdatePrompt has a usable window size.
 * Waits out in-flight window animation so expand/uncollapse is not no-op'd.
 */
async function waitForWindowAnimationIdle(
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

async function ensureUpdatePromptVisible(get: () => AppStore) {
  await waitForWindowAnimationIdle(get);
  const state = get();
  if (state.miniModeActive) {
    if (!state.miniModeKeyboardVisible) {
      await state.expandMiniModeKeyboard();
      // Animation may have started after we checked; retry once if expand no-op'd.
      if (!get().miniModeKeyboardVisible) {
        await waitForWindowAnimationIdle(get);
        if (!get().miniModeKeyboardVisible) {
          await get().expandMiniModeKeyboard();
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
 * Keep miniModeActive / mouseVisible in sync with settings + monitors.
 * Enter: hide mouse panel (session restore on exit). Leave: restore layout.
 */
async function refreshMiniModeState(options?: { animate?: boolean }) {
  const state = useAppStore.getState();
  const { settings, monitors, miniModeActive: wasActive } = state;
  const enabled =
    monitors.length > 0 && resolveMiniModeEnabled(settings, monitors);
  const animate = options?.animate !== false;

  if (enabled && !wasActive) {
    const mouseBefore = settings.mouseVisible;
    useAppStore.setState({
      miniModeActive: true,
      miniModeKeyboardVisible: false,
      miniModeManualExpand: false,
      miniModeSuppressAutoShow: false,
      mouseVisibleBeforeMiniMode: mouseBefore,
      settings: mouseBefore ? { ...settings, mouseVisible: false } : settings,
    });
    await syncMiniModeWindowLayout(animate);
    return;
  }

  if (!enabled && wasActive) {
    const restore = state.mouseVisibleBeforeMiniMode;
    const nextSettings =
      restore !== null ? { ...settings, mouseVisible: restore } : settings;
    useAppStore.setState({
      miniModeActive: false,
      miniModeKeyboardVisible: false,
      miniModeManualExpand: false,
      miniModeSuppressAutoShow: false,
      mouseVisibleBeforeMiniMode: null,
      settings: nextSettings,
    });
    await syncWindowLayoutFromSettings(nextSettings, animate);
    return;
  }

  if (enabled) {
    // Still active: enforce mouse panel hidden and keep window layout in sync.
    if (settings.mouseVisible) {
      if (state.mouseVisibleBeforeMiniMode === null) {
        useAppStore.setState({ mouseVisibleBeforeMiniMode: true });
      }
      useAppStore.setState({
        settings: { ...settings, mouseVisible: false },
      });
    }
    await syncMiniModeWindowLayout(animate);
  }
}

const LANGUAGE_CHANGE_FALLBACK =
  "Could not switch keyboard language.";

function physicalKeyStateEqual(a: PhysicalKeyState, b: PhysicalKeyState): boolean {
  return (
    a.capsLock === b.capsLock &&
    a.shift === b.shift &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.win === b.win &&
    a.systemLanguage === b.systemLanguage &&
    a.keyboardLayout === b.keyboardLayout &&
    a.systemKlid === b.systemKlid &&
    a.systemHkl === b.systemHkl &&
    a.hasInputTarget === b.hasInputTarget &&
    a.pressedVks.length === b.pressedVks.length &&
    a.pressedVks.every((vk, i) => vk === b.pressedVks[i])
  );
}

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
  engine: "winrt" | "groq" | null;
  groqConfigured: boolean;
  winrtSupported: boolean;
  online: boolean;
  canDictate: boolean;
}

interface AppStore {
  profileFiles: ProfileFileInfo[];
  activeProfileFile: string | null;
  settings: AppSettings;
  /**
   * Bumped whenever profile settings are reloaded from the backend.
   * In-flight full-settings writers capture this and abort if it changes,
   * so a stale window cannot clobber a newer profile load/switch.
   */
  settingsEpoch: number;
  /** False until the first profile load finishes; blocks persist of DEFAULT_SETTINGS. */
  profileHydrated: boolean;
  /** Last pointer kind used for touch vs mouse layout profiles. */
  pointerInputKind: PointerInputKind;
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
  inputMethods: InputMethod[];
  layoutKeyLabels: LayoutKeyLabel[];
  languagePickerOpen: boolean;
  /** Session-only: guided piano teaching replaces Phrases while on. */
  musicTeachingEnabled: boolean;
  musicSongId: string | null;
  musicNoteIndex: number;
  /** Session-only: demo playback of the selected song. */
  musicPlaybackActive: boolean;
  phrasesVisibleBeforeTeaching: boolean | null;
  /** Session-only: restore mouse after leaving 5-octave (wide) piano mode. */
  mouseVisibleBeforeWidePiano: boolean | null;
  /** Session-only: restore mouse after leaving Mini Mode. */
  mouseVisibleBeforeMiniMode: boolean | null;
  /** Persisted imported songs (app data library). */
  importedSongs: ImportedMusicSong[];
  /** Mini Mode shell active (single/mirror or override). */
  miniModeActive: boolean;
  /** Whether the mini-mode keyboard is popped (vs collapsed FAB). */
  miniModeKeyboardVisible: boolean;
  /**
   * True after Expand until external input loses focus.
   * Expand does not exit Mini Mode.
   */
  miniModeManualExpand: boolean;
  /** After manual collapse, skip auto-show until external focus is lost once. */
  miniModeSuppressAutoShow: boolean;
  loadProfileFiles: () => Promise<void>;
  setProfileFile: (filename: string) => Promise<void>;
  createProfileFile: (filename: string, name: string) => Promise<void>;
  deleteProfileFile: (filename: string) => Promise<void>;
  updateSettings: (
    partial: Partial<AppSettings>,
    options?: { syncToSystem?: boolean },
  ) => Promise<void>;
  /**
   * Switch active layout profile by pointer kind. Persists outgoing flat
   * layout into that kind's snapshot, then applies the incoming snapshot.
   */
  setPointerInputKind: (kind: PointerInputKind) => Promise<void>;
  /** Map a DOM pointerType to PointerInputKind and switch if needed. */
  handlePointerInputEvent: (pointerType: string) => void;
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
  loadInputMethods: () => Promise<void>;
  setLanguagePickerOpen: (open: boolean) => void;
  selectTypingInputMethod: (method: InputMethod) => Promise<void>;
  refreshLayoutKeyLabels: (hkl?: number) => Promise<void>;
  clearSticky: () => void;
  clearStickyExceptFn: () => void;
  loadSuggestions: () => Promise<void>;
  applySuggestion: (word: string) => Promise<void>;
  recordTypedWord: () => Promise<void>;
  setLastError: (error: string | null) => void;
  pollError: () => Promise<void>;
  setDictationState: (state: DictationState) => void;
  setSttCapability: (capability: SttCapability | null) => void;
  refreshSttCapability: () => Promise<void>;
  toggleDictation: () => Promise<void>;
  stopDictation: () => Promise<void>;
  setShowSettings: (show: boolean) => void;
  setShowMacroBuilder: (show: boolean) => void;
  setShowHeadTrackingWizard: (show: boolean) => void;
  syncWindowFocusable: () => Promise<void>;
  loadKeyboardLayout: () => Promise<void>;
  toggleCollapsed: () => Promise<void>;
  /** Recompute mini mode from settings/monitors and sync window layout. */
  refreshMiniModeState: (options?: { animate?: boolean }) => Promise<void>;
  /** Expand FAB: reopen keyboard until external focus is lost (stay in Mini Mode). */
  expandMiniModeKeyboard: () => Promise<void>;
  /** Collapse keyboard back to the mini-mode FAB stack. */
  collapseMiniModeKeyboard: () => Promise<void>;
  enableMusicTeaching: () => Promise<void>;
  disableMusicTeaching: (options?: { hidePhrases?: boolean }) => Promise<void>;
  setMusicSongId: (songId: string) => Promise<void>;
  restartMusicLesson: () => void;
  reportMusicKeyPlayed: (keyId: string) => void;
  startMusicPlayback: () => void;
  stopMusicPlayback: () => void;
  setMusicPlaybackNoteIndex: (index: number) => void;
  finishMusicPlayback: () => void;
  loadImportedSongs: () => Promise<void>;
  importMusicSongsFromFile: () => Promise<void>;
  deleteImportedSong: (id: string) => Promise<void>;
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
    // Keep predictionEnabled and suggestionsVisible independent so Mini Mode can
    // show the "predictions off / enable" bar while the suggestions strip stays visible.
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
      sectionStack: resolveSectionStack(parsed.sectionStack, parsed.sectionLayouts),
      synthesizerOctaveCount: resolveSynthOctaveCount(parsed.synthesizerOctaveCount),
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
  set({ settings, settingsEpoch: get().settingsEpoch + 1 });
  const isMainWindow = WebviewWindow.getCurrent().label === "main";
  if (isMainWindow) {
    await invoke("cmd_set_system_language", { language: settings.typingLanguage });
    await get().pollKeyboardState();
  }
  await get().loadQuickActions();
  await get().loadPhrases();
  await get().loadMacros();
  if (isMainWindow) {
    await refreshMiniModeState({ animate: options?.animateLayout === true });
    if (!get().miniModeActive) {
      await syncWindowLayoutFromSettings(
        get().settings,
        options?.animateLayout === true,
      );
    }
  }
}

/** Persist full settings only if this window's profile epoch is still current. */
async function persistSettingsIfCurrent(
  get: () => AppStore,
  epoch: number,
  settings: AppSettings,
): Promise<boolean> {
  if (!get().profileHydrated || get().settingsEpoch !== epoch) {
    return false;
  }
  await invoke("cmd_update_profile_settings", {
    profileId: INTERNAL_PROFILE_ID,
    settingsJson: JSON.stringify(settings),
  });
  return get().profileHydrated && get().settingsEpoch === epoch;
}

/**
 * If `word` matches `prefix` case-insensitively, return the unmatched suffix
 * of `word`. Length is measured by folding characters one at a time so
 * case-fold expansions (e.g. İ → i̇) do not desync the slice index.
 * Returns null when there is no case-insensitive prefix match (caller should
 * delete + retype), or the full word when prefix is empty.
 */
function suggestionSuffixAfterPrefix(word: string, prefix: string): string | null {
  if (prefix.length === 0) return word;
  const target = prefix.toLowerCase();
  let i = 0;
  let folded = "";
  while (i < word.length && folded.length < target.length) {
    folded += word[i]!.toLowerCase();
    i += 1;
  }
  if (folded === target || folded.startsWith(target)) {
    return word.slice(i);
  }
  return null;
}

export const useAppStore = create<AppStore>((set, get) => ({
  profileFiles: [],
  activeProfileFile: null,
  settings: DEFAULT_SETTINGS,
  settingsEpoch: 0,
  profileHydrated: false,
  pointerInputKind: "mouse",
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
  inputMethods: [],
  layoutKeyLabels: [],
  languagePickerOpen: false,
  musicTeachingEnabled: false,
  musicSongId: "twinkle",
  musicNoteIndex: 0,
  musicPlaybackActive: false,
  phrasesVisibleBeforeTeaching: null,
  mouseVisibleBeforeWidePiano: null,
  mouseVisibleBeforeMiniMode: null,
  importedSongs: [],
  miniModeActive: false,
  miniModeKeyboardVisible: false,
  miniModeManualExpand: false,
  miniModeSuppressAutoShow: false,
  isAnimatingWindow: false,
  pendingUpdate: null,
  updateCheckStatus: "idle",

  setPendingUpdate: (update) => {
    set({ pendingUpdate: update });
    void get().syncWindowFocusable();
    // Expand mini keyboard / uncollapse so the themed modal has room to render.
    if (update) {
      void ensureUpdatePromptVisible(get);
    }
  },

  checkForUpdates: async () => {
    set({ updateCheckStatus: "checking" });
    try {
      const update = await checkForUpdate();
      if (update) {
        set({ pendingUpdate: update, updateCheckStatus: "idle" });
        void ensureUpdatePromptVisible(get);
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
    set({ profileHydrated: true });
  },

  setProfileFile: async (filename) => {
    // Invalidate in-flight full-settings writers before the backend switch.
    set({ settingsEpoch: get().settingsEpoch + 1 });
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
        if (get().mouseVisibleBeforeWidePiano === null) {
          set({ mouseVisibleBeforeWidePiano: settings.mouseVisible });
        }
        next = { ...next, mouseVisible: false };
      }
    } else if (wasWide && partial.synthesizerOctaveCount !== undefined) {
      const restore = get().mouseVisibleBeforeWidePiano;
      set({ mouseVisibleBeforeWidePiano: null });
      if (restore !== null && partial.mouseVisible === undefined) {
        next = { ...next, mouseVisible: restore };
      }
    }

    // Mini Mode: keep mouse panel hidden (OS cursor stays visible).
    if (get().miniModeActive && next.mouseVisible) {
      if (get().mouseVisibleBeforeMiniMode === null) {
        set({ mouseVisibleBeforeMiniMode: settings.mouseVisible });
      }
      next = { ...next, mouseVisible: false };
    }

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

    if (partialContainsLayoutFields(partial)) {
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
      typingLanguageSwitchInFlight = true;
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
              settings: { ...get().settings, typingLanguage: previousTypingLanguage },
            });
          }
          const message = result.error?.trim() || LANGUAGE_CHANGE_FALLBACK;
          lastAnnouncedError = message;
          notify.error(message, { id: "typing-language-switch" });
          return;
        }
        lastAnnouncedError = null;
        await get().refreshLayoutKeyLabels();
      } catch (error) {
        if (get().settingsEpoch === epoch) {
          set({
            settings: { ...get().settings, typingLanguage: previousTypingLanguage },
          });
        }
        const message =
          error instanceof Error
            ? error.message
            : String(error || LANGUAGE_CHANGE_FALLBACK);
        lastAnnouncedError = message;
        notify.error(message, { id: "typing-language-switch" });
        return;
      } finally {
        typingLanguageSwitchInFlight = false;
      }
    }
    if (get().settingsEpoch !== epoch) {
      return;
    }
    const persisted = await persistSettingsIfCurrent(get, epoch, get().settings);
    if (!persisted) {
      return;
    }
    await emit(PROFILE_UPDATED_EVENT, {
      source: WebviewWindow.getCurrent().label,
    });
    if (typingLanguageChanged) {
      await get().stopDictation();
      set({ typedBuffer: "", suggestions: [] });
      await get().refreshSttCapability();
    }
    if (partial.groqApiKey !== undefined) {
      await get().refreshSttCapability();
    }
    if (uiLanguageChanged) {
      set({ typedBuffer: "", suggestions: [] });
      await get().loadPhrases();
      await get().loadSuggestions();
    }
    if (
      partial.predictionEnabled !== undefined ||
      partial.suggestionsVisible !== undefined
    ) {
      await get().loadSuggestions();
    }
    {
      const current = get().settings;
      const visibilityChanged =
        partial.phrasesVisible !== undefined ||
        partial.quickActionsVisible !== undefined;
      // Transparent is CSS-only; do not trigger mini layout refresh/animation.
      const miniModeSettingChanged = partial.miniModeOverride !== undefined;
      if (miniModeSettingChanged || partial.accessibilityMonitorId !== undefined) {
        await refreshMiniModeState({ animate: true });
      } else if (get().miniModeActive) {
        if (
          partial.collapsed !== undefined ||
          partial.windowHeightRatio !== undefined ||
          (current.collapsed && partial.dictationVisible !== undefined) ||
          visibilityChanged
        ) {
          if (partial.windowHeightRatio !== undefined) {
            liveHeightRatioPreview = null;
          }
          await syncMiniModeWindowLayout(true);
        }
      } else if (
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

  setPointerInputKind: async (kind) => {
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
    if (WebviewWindow.getCurrent().label === "main") {
      if (get().miniModeActive) {
        void syncMiniModeWindowLayout(true);
      } else {
        void syncWindowLayoutFromSettings(next, true);
      }
    }
  },

  handlePointerInputEvent: (pointerType) => {
    const kind = pointerKindFromEvent(pointerType);
    if (kind === get().pointerInputKind) {
      // Alternating back to the current kind cancels a pending switch.
      if (pointerInputKindDebounceTimer !== null) {
        clearTimeout(pointerInputKindDebounceTimer);
        pointerInputKindDebounceTimer = null;
        pendingPointerInputKind = null;
      }
      return;
    }
    pendingPointerInputKind = kind;
    if (pointerInputKindDebounceTimer !== null) {
      clearTimeout(pointerInputKindDebounceTimer);
    }
    pointerInputKindDebounceTimer = setTimeout(() => {
      pointerInputKindDebounceTimer = null;
      const next = pendingPointerInputKind;
      pendingPointerInputKind = null;
      if (next !== null) {
        void get().setPointerInputKind(next);
      }
    }, POINTER_INPUT_KIND_DEBOUNCE_MS);
  },

  applyWindowHeightRatioLive: async (ratio) => {
    const { settings, miniModeActive } = get();
    if (settings.collapsed || miniModeActive) return;
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
    liveHeightRatioPending = heightRatio;
    if (liveHeightRatioRaf !== null || liveHeightRatioInFlight) return;

    await new Promise<void>((resolve) => {
      liveHeightRatioRaf = requestAnimationFrame(() => {
        liveHeightRatioRaf = null;
        resolve();
      });
    });

    const pending = liveHeightRatioPending;
    liveHeightRatioPending = null;
    if (pending === null) return;
    if (
      liveHeightRatioPreview !== null &&
      Math.abs(liveHeightRatioPreview - pending) < 0.002
    ) {
      return;
    }

    const latest = get().settings;
    if (latest.collapsed) return;
    liveHeightRatioPreview = pending;
    liveHeightRatioInFlight = true;
    try {
      await invoke("cmd_apply_window_layout", {
        monitorId: latest.accessibilityMonitorId,
        collapsed: false,
        collapsedDictation: false,
        heightRatio: pending,
      });
    } catch {
      // Rejected ratio must not block near-equal retries.
      if (liveHeightRatioPreview === pending) {
        liveHeightRatioPreview = null;
      }
    } finally {
      liveHeightRatioInFlight = false;
      // Flush any ratio queued while the previous invoke was in flight.
      if (liveHeightRatioPending !== null) {
        const queued = liveHeightRatioPending;
        liveHeightRatioPending = null;
        void get().applyWindowHeightRatioLive(queued);
      }
    }
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
    if (WebviewWindow.getCurrent().label === "main" && get().profileHydrated) {
      await refreshMiniModeState({ animate: false });
    }
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
    const epoch = get().settingsEpoch;
    const next = await invoke<PhysicalKeyState>("cmd_get_keyboard_state");
    const { physicalKeyState: prev, settings, keyboardLayout } = get();

    // Sync from the focused/target app so Win+Space / Alt+Shift updates our layout.
    // Skip while a language-button switch is in flight.
    const typingLanguageUnchanged =
      typingLanguageSwitchInFlight ||
      settings.typingLanguage === next.systemLanguage;
    const layoutUnchanged =
      keyboardLayout === next.keyboardLayout &&
      prev.systemHkl === next.systemHkl &&
      prev.systemKlid === next.systemKlid;

    if (
      physicalKeyStateEqual(prev, next) &&
      typingLanguageUnchanged &&
      layoutUnchanged
    ) {
      return;
    }

    if (get().settingsEpoch !== epoch) {
      return;
    }

    set({
      physicalKeyState: next,
      keyboardLayout: next.keyboardLayout,
      ...(typingLanguageUnchanged
        ? {}
        : { settings: { ...settings, typingLanguage: next.systemLanguage } }),
    });

    if (!layoutUnchanged) {
      await get().refreshLayoutKeyLabels(next.systemHkl);
    }

    if (!typingLanguageUnchanged) {
      const persisted = await persistSettingsIfCurrent(get, epoch, get().settings);
      if (!persisted) {
        return;
      }
      set({ typedBuffer: "", suggestions: [] });
    }
  },

  loadInputMethods: async () => {
    const inputMethods = await invoke<InputMethod[]>("cmd_get_input_methods");
    set({ inputMethods });
  },

  setLanguagePickerOpen: (open) => set({ languagePickerOpen: open }),

  selectTypingInputMethod: async (method) => {
    const epoch = get().settingsEpoch;
    const previousTypingLanguage = get().settings.typingLanguage;
    typingLanguageSwitchInFlight = true;
    set({ languagePickerOpen: false });
    try {
      const result = await invoke<CommandResult>("cmd_set_input_method", {
        hkl: method.hkl,
      });
      if (!result.success) {
        const message = result.error?.trim() || LANGUAGE_CHANGE_FALLBACK;
        lastAnnouncedError = message;
        notify.error(message, { id: "typing-language-switch" });
        return;
      }
      if (get().settingsEpoch !== epoch) {
        return;
      }
      set({
        settings: {
          ...get().settings,
          typingLanguage: method.langTag,
        },
        keyboardLayout: method.layoutName,
      });
      const persisted = await persistSettingsIfCurrent(get, epoch, get().settings);
      if (!persisted) {
        return;
      }
      await emit(PROFILE_UPDATED_EVENT, {
        source: WebviewWindow.getCurrent().label,
      });
      if (previousTypingLanguage !== method.langTag) {
        await get().stopDictation();
        set({ typedBuffer: "", suggestions: [] });
        await get().refreshSttCapability();
      }
      await get().refreshLayoutKeyLabels(method.hkl);
      await get().pollKeyboardState();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error || LANGUAGE_CHANGE_FALLBACK);
      lastAnnouncedError = message;
      notify.error(message, { id: "typing-language-switch" });
    } finally {
      typingLanguageSwitchInFlight = false;
    }
  },

  refreshLayoutKeyLabels: async (hkl?: number) => {
    const targetHkl = hkl ?? get().physicalKeyState.systemHkl;
    const layoutKeyLabels = await invoke<LayoutKeyLabel[]>(
      "cmd_get_layout_key_labels",
      { hkl: targetHkl || null },
    );
    set({ layoutKeyLabels });
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
      language: settings.typingLanguage || "en",
    });
    set({ suggestions: results.map((r) => r.word) });
  },

  applySuggestion: async (word) => {
    const { settings, typedBuffer } = get();
    const parts = typedBuffer.split(/\s+/);
    const prefix = parts[parts.length - 1] ?? "";
    parts[parts.length - 1] = word;
    const next = parts.join(" ") + " ";
    set({ typedBuffer: next });

    const suffix = suggestionSuffixAfterPrefix(word, prefix);
    if (suffix !== null) {
      await invoke("cmd_type_text", { text: suffix + " " });
    } else {
      for (let i = 0; i < prefix.length; i++) {
        await invoke("cmd_press_key", {
          request: { key: "backspace", modifiers: [] },
        });
      }
      await invoke("cmd_type_text", { text: word + " " });
    }
    await invoke("cmd_record_word", {
      profileId: INTERNAL_PROFILE_ID,
      word,
      language: settings.typingLanguage || "en",
    });
    await get().loadSuggestions();
  },

  recordTypedWord: async () => {
    const { settings, typedBuffer } = get();
    if (!settings.predictionEnabled) return;
    const parts = typedBuffer.trimEnd().split(/\s+/);
    const word = parts[parts.length - 1] ?? "";
    if (word.length < 2) return;
    if (!/^[\p{L}][\p{L}'’-]*$/u.test(word)) return;
    await invoke("cmd_record_word", {
      profileId: INTERNAL_PROFILE_ID,
      word,
      language: settings.typingLanguage || "en",
    });
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
      const settingsKey = get().settings.groqApiKey?.trim() || null;
      const status = await invoke<{
        state: DictationState;
        engine: "winrt" | "groq" | null;
        groqConfigured: boolean;
        winrtSupported: boolean;
        online: boolean;
        canDictate: boolean;
      }>("cmd_get_stt_status", {
        language: get().settings.typingLanguage,
        groqApiKey: settingsKey,
      });
      set({
        dictationState: status.state,
        sttCapability: {
          engine: status.engine,
          groqConfigured: status.groqConfigured,
          winrtSupported: status.winrtSupported,
          online: status.online,
          canDictate: status.canDictate,
        },
      });
    } catch {
      set({
        sttCapability: {
          engine: null,
          groqConfigured: false,
          winrtSupported: false,
          online: false,
          canDictate: false,
        },
      });
    }
  },

  stopDictation: async () => {
    if (get().dictationState === "idle") return;
    // Optimistic: clear listening UI immediately so the mic toggle feels responsive
    // even when Groq was mid-transcription (common on Greek path).
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
        lastError: !sttCapability.online
          ? "GROQ_API: Dictation requires an internet connection."
          : sttCapability.winrtSupported
            ? "GROQ_API: Dictation is unavailable right now."
            : "GROQ_KEY: Windows speech recognition does not support this language. Add a free Groq API key in Settings to dictate.",
      });
      return;
    }
    try {
      await invoke("cmd_start_dictation", {
        language: settings.typingLanguage,
        groqApiKey: settings.groqApiKey?.trim() || null,
      });
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
    const { settings, musicTeachingEnabled, musicSongId, importedSongs } = get();
    if (musicTeachingEnabled) return;
    set({
      musicTeachingEnabled: true,
      phrasesVisibleBeforeTeaching: settings.phrasesVisible,
      musicNoteIndex: 0,
      musicSongId: musicSongId ?? "twinkle",
    });
    const song = getSongById(get().musicSongId, importedSongs);
    const patch: Partial<AppSettings> = {};
    if (!settings.phrasesVisible) {
      patch.phrasesVisible = true;
    }
    if (song) {
      const fit = songPianoRangeFit(song);
      if (fit) {
        patch.synthesizerOctaveCount = fit.octaveCount;
        patch.synthesizerStartOctave = fit.startOctave;
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
    const song = getSongById(songId, get().importedSongs);
    if (!song) return;
    set({ musicSongId: songId, musicNoteIndex: 0, musicPlaybackActive: false });
    const fit = songPianoRangeFit(song);
    if (fit) {
      await get().updateSettings({
        synthesizerOctaveCount: fit.octaveCount,
        synthesizerStartOctave: fit.startOctave,
      });
    }
  },

  restartMusicLesson: () => {
    set({ musicNoteIndex: 0, musicPlaybackActive: false });
  },

  reportMusicKeyPlayed: (keyId) => {
    const { musicTeachingEnabled, musicPlaybackActive, musicSongId, musicNoteIndex, importedSongs } =
      get();
    if (!musicTeachingEnabled || musicPlaybackActive) return;
    const song = getSongById(musicSongId, importedSongs);
    if (!song) return;
    if (musicNoteIndex >= song.notes.length) return;
    if (song.notes[musicNoteIndex]?.pitch !== keyId) return;
    set({ musicNoteIndex: musicNoteIndex + 1 });
  },

  startMusicPlayback: () => {
    if (!get().musicTeachingEnabled) return;
    const song = getSongById(get().musicSongId, get().importedSongs);
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

  loadImportedSongs: async () => {
    try {
      const songs = await invoke<ImportedMusicSong[]>("cmd_list_imported_songs");
      set({
        importedSongs: Array.isArray(songs)
          ? songs.filter((song) => song && typeof song.id === "string")
          : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  importMusicSongsFromFile: async () => {
    try {
      const path = await invoke<string | null>("cmd_pick_music_song_file");
      if (!path) return;
      const payload = await invoke<MusicFilePayload>("cmd_read_music_file", { path });
      const songs = await parseMusicFilePayload(payload);
      for (const song of songs) {
        await invoke("cmd_upsert_imported_song", { song });
      }
      await get().loadImportedSongs();
      const last = songs[songs.length - 1];
      if (last) {
        await get().setMusicSongId(last.id);
      }
      notify.success(
        songs.length === 1
          ? `Imported “${songs[0]!.title}”`
          : `Imported ${songs.length} songs`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  deleteImportedSong: async (id) => {
    const song = get().importedSongs.find((entry) => entry.id === id);
    if (!song || !isImportedMusicSong(song)) return;
    try {
      get().stopMusicPlayback();
      await invoke("cmd_delete_imported_song", { id });
      await get().loadImportedSongs();
      if (get().musicSongId === id) {
        await get().setMusicSongId(BUILT_IN_SONGS[0]?.id ?? "twinkle");
      }
      notify.success(`Deleted “${song.title}”`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  toggleCollapsed: async () => {
    if (get().isAnimatingWindow) {
      return;
    }
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
        if (get().settingsEpoch !== epoch) {
          return;
        }
        set({ settings: next });
        await persistSettingsIfCurrent(get, epoch, next);
      }
    } finally {
      set({ isAnimatingWindow: false });
      const queued = pendingMiniLayoutSync;
      pendingMiniLayoutSync = null;
      if (queued !== null && get().miniModeActive) {
        void syncMiniModeWindowLayout(queued);
      }
    }
  },

  refreshMiniModeState: async (options) => {
    await refreshMiniModeState(options);
  },

  expandMiniModeKeyboard: async () => {
    if (!get().miniModeActive || get().isAnimatingWindow) {
      return;
    }
    if (get().miniModeKeyboardVisible && get().miniModeManualExpand) {
      return;
    }
    set({
      miniModeKeyboardVisible: true,
      miniModeManualExpand: true,
      miniModeSuppressAutoShow: false,
    });
    await syncMiniModeWindowLayout(true);
  },

  collapseMiniModeKeyboard: async () => {
    if (!get().miniModeActive || get().isAnimatingWindow) {
      return;
    }
    if (!get().miniModeKeyboardVisible) {
      return;
    }
    set({
      miniModeKeyboardVisible: false,
      miniModeManualExpand: false,
      miniModeSuppressAutoShow: true,
    });
    await syncMiniModeWindowLayout(true);
  },
}));

/**
 * Mini Mode: show keyboard on external editable focus; hide when focus is lost.
 * Manual Expand keeps the keyboard until focus is lost (does not exit Mini Mode).
 */
void listen<{ focused: boolean }>("input-focus-changed", (event) => {
  const state = useAppStore.getState();
  if (!state.miniModeActive) return;
  const focused = event.payload.focused;
  if (focused) {
    if (!state.miniModeKeyboardVisible && !state.miniModeSuppressAutoShow) {
      useAppStore.setState({ miniModeKeyboardVisible: true });
      void syncMiniModeWindowLayout(true);
    }
    return;
  }
  // Focus lost → hide keyboard and clear manual expand / collapse suppression.
  if (
    state.miniModeKeyboardVisible ||
    state.miniModeManualExpand ||
    state.miniModeSuppressAutoShow
  ) {
    useAppStore.setState({
      miniModeKeyboardVisible: false,
      miniModeManualExpand: false,
      miniModeSuppressAutoShow: false,
    });
    void syncMiniModeWindowLayout(true);
  }
});

export async function getMacroSteps(macroId: string): Promise<MacroStep[]> {
  return invoke<MacroStep[]>("cmd_get_macro_steps", { macroId });
}
