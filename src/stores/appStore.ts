import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, formatUpdateCheckError } from "../lib/updater";
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
import {
  clampWindowHeightRatio,
  computeContentHeightRatioFromSettings,
} from "../lib/sectionLayouts";
import { resolveSectionStack, ensureSectionExpanded } from "../lib/sectionStack";
import { MINI_KEYBOARD_HEIGHT_RATIO, resolveMiniModeEnabled, isInputPreviewActiveForMode } from "../lib/miniMode";
import {
  mapCompanionSessionPhase,
  shouldIgnoreCompanionIdle,
  shouldStopCompanionBridgeOnHostMode,
} from "../lib/companionSession";
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
  effectiveLargeHeaders,
  isMusicLessonSlotVisible,
  isTeachingFullWorkArea,
  isV1ToolWindowHidden,
} from "../lib/v1HiddenFeatures";
import {
  captureModeBeforeCompanion,
  captureWindowHeightRatioBeforeTeaching,
  coercePersistedKeyboardSectionMode,
  heightRatioAfterLeavingTeaching,
  hydrateKeyboardSectionMode,
  needsKeyboardSectionModeMigration,
  resolveSelectedAppMode,
  restoreModeAfterCompanion,
  settingsForPersist,
  shouldDelegateAppModeToMain,
  shouldSyncNonMiniWindowLayout,
  teachingSessionKeyboardMode,
  APP_MODE_REQUEST_EVENT,
  TEACHING_LESSON_REQUEST_EVENT,
  TEACHING_SESSION_EVENT,
  type AppModeRequest,
  type AppModeTablet,
  type CompanionSessionPhase,
  type HostAppMode,
  type TeachingLessonRequest,
  type TeachingSessionPayload,
  type WindowHeightRatioBeforeTeaching,
} from "../lib/appModeLayout";
import {
  partialContainsLayoutFields,
  persistLayoutForKind,
  pointerKindFromEvent,
  stripFullscreenHeightFromLayoutSnapshots,
  switchPointerInputKindLayout,
} from "../lib/layoutProfiles";
import {
  currentSpellAnswer,
  defaultLanguagePackId,
  getLanguagePackById,
  isLanguageLessonActive,
  isLanguageLessonCaptureActive,
  isLanguageLessonSpellingActive,
  languageAnswersMatch,
} from "../lib/language";
import {
  clampFreeWriteZoom,
  isFreeWriteCaptureActive,
  removeTeachingPdfEntry,
  upsertTeachingPdfEntry,
  type FreeWriteFocus,
  type LanguageSubjectTab,
  type TeachingPdfEntry,
} from "../lib/teaching";
import {
  type GreekPendingAccent,
} from "../lib/language/greekCompose";
import {
  greekComposeEnabled,
  processCharacterInput,
  type GreekComposeContext,
} from "../lib/keyboardCharacterInput";
import {
  applyGreekLayoutTranslation,
  type LayoutKeyTranslation,
} from "../lib/layoutKeyTranslation";
import type { LanguagePack, LessonLanguage } from "../lib/language/types";
import { DEFAULT_LANGUAGE_AGE_BAND } from "../lib/language/types";

export type LanguageListAuthoringField = "title" | "words";

export type LanguageListAuthoringHandlers = {
  keyInput: (ch: string, options?: { physicalKey?: string }) => void;
  backspace: () => void;
  enter: () => void;
  layoutTranslation: (
    translation: LayoutKeyTranslation,
    options: { physicalKey?: string; shift?: boolean; fallbackOutput?: string },
  ) => void;
};

function emptyLanguageLessonState() {
  return {
    languagePackId: null as string | null,
    languageTaskIndex: 0,
    languageInputBuffer: "",
    languageAnswerIncorrect: false,
    languageLessonPlaying: false,
    languageListAuthoringActive: false,
    languageListAuthoringField: "title" as LanguageListAuthoringField,
    languageListAuthoringHandlers: null as LanguageListAuthoringHandlers | null,
  };
}

function initLanguageLessonState(
  settings: AppSettings,
  languagePackId: string | null,
  extraPacks: LanguagePack[] = [],
) {
  const band = settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
  const lessonLanguage: LessonLanguage =
    settings.languageLessonLanguage ??
    (settings.typingLanguage === "en" ? "en" : "el");
  const resolvedId =
    languagePackId && getLanguagePackById(languagePackId, extraPacks)
      ? languagePackId
      : defaultLanguagePackId(band, lessonLanguage);
  return {
    languagePackId: resolvedId,
    languageTaskIndex: 0,
    languageInputBuffer: "",
    languageAnswerIncorrect: false,
  };
}

function greekComposeContextFromState(state: {
  settings: AppSettings;
  keyboardLayout: string;
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  languagePackId: string | null;
  customLanguagePacks: LanguagePack[];
  languageLessonPlaying?: boolean;
  languageListAuthoringActive?: boolean;
  languageSubjectTab?: LanguageSubjectTab;
}): GreekComposeContext {
  const pack = getLanguagePackById(state.languagePackId, state.customLanguagePacks);
  return {
    typingLanguage: state.settings.typingLanguage,
    keyboardLayout: state.keyboardLayout,
    onscreenLayout: state.settings.onscreenLayout,
    languageLessonActive: isLanguageLessonCaptureActive({
      musicTeachingEnabled: state.musicTeachingEnabled,
      teachingLesson: state.teachingLesson,
      settings: state.settings,
      languageLessonPlaying: state.languageLessonPlaying,
      languageListAuthoringActive: state.languageListAuthoringActive,
      languageSubjectTab: state.languageSubjectTab ?? "spelling",
    }),
    lessonLanguage:
      pack?.lessonLanguage ?? state.settings.languageLessonLanguage,
  };
}

function languageLessonModeFromState(state: {
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  settings: AppSettings;
  languageLessonPlaying: boolean;
  languageListAuthoringActive: boolean;
  languageSubjectTab: LanguageSubjectTab;
}) {
  return {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    settings: state.settings,
    languageLessonPlaying: state.languageLessonPlaying,
    languageListAuthoringActive: state.languageListAuthoringActive,
    languageSubjectTab: state.languageSubjectTab,
  };
}

function freeWriteModeFromState(state: {
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  settings: AppSettings;
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
}) {
  return {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    settings: state.settings,
    languageSubjectTab: state.languageSubjectTab,
    freeWriteFocus: state.freeWriteFocus,
  };
}

function teachingPdfFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

function clearGreekPendingAccent() {
  return { greekPendingAccent: null as GreekPendingAccent | null };
}

/** Avoid re-toasting the same backend error until it clears. */
let lastAnnouncedError: string | null = null;

async function startCompanionBridge(): Promise<void> {
  await invoke("cmd_companion_start", { port: null });
}

async function stopCompanionBridge(): Promise<void> {
  try {
    await invoke("cmd_companion_stop");
  } catch {
    // Already stopped or never started.
  }
}

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
      collapsedDictation: false,
      collapsedSettings: true,
      heightRatio: heightRatioFromSettings(
        settings,
        useAppStore.getState().musicTeachingEnabled,
      ),
      miniMode: true,
      miniKeyboardVisible: visibleAtStart,
      miniKeyboardHeightRatio: MINI_KEYBOARD_HEIGHT_RATIO,
      fullWorkArea: false,
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
  const teachingActive =
    state.musicTeachingEnabled && settings.keyboardSectionMode === "synthesizer";
  const enabled =
    monitors.length > 0 &&
    resolveMiniModeEnabled(settings, monitors, teachingActive);
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
  } else if (!enabled && wasActive) {
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
    await syncWindowLayoutFromSettings(nextSettings, animate, useAppStore.getState().musicTeachingEnabled);
  } else if (enabled) {
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

  await syncInputPreviewEnabled(useAppStore.getState);
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

function lessonSlotVisibleFromState(
  settings: AppSettings,
  musicTeachingEnabled: boolean,
): boolean {
  return isMusicLessonSlotVisible({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });
}

function teachingFullWorkAreaActive(
  settings: AppSettings,
  musicTeachingEnabled: boolean,
): boolean {
  return isTeachingFullWorkArea({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });
}

export type TeachingLesson = "music" | "math" | "language";
export type { AppModeTablet, WindowHeightRatioBeforeTeaching };

function heightRatioFromSettings(
  settings: AppSettings,
  musicTeachingEnabled = false,
): number {
  if (teachingFullWorkAreaActive(settings, musicTeachingEnabled)) {
    return 1.0;
  }
  const contentRatio = computeContentHeightRatioFromSettings(
    settings,
    lessonSlotVisibleFromState(settings, musicTeachingEnabled),
  );
  if (settings.windowHeightRatio == null) {
    return contentRatio;
  }
  return Math.max(contentRatio, clampWindowHeightRatio(settings.windowHeightRatio));
}

/** Apply effective v1 chrome reads without wiping unrelated stored prefs. */
function withV1EffectiveChrome(settings: AppSettings): AppSettings {
  const largeHeaders = effectiveLargeHeaders(settings.largeHeaders);
  if (largeHeaders === settings.largeHeaders) {
    return settings;
  }
  return { ...settings, largeHeaders };
}

function windowLayoutInvokeArgs(
  settings: AppSettings,
  musicTeachingEnabled: boolean,
  extras?: {
    collapsed?: boolean;
    collapsedDictation?: boolean;
    collapsedSettings?: boolean;
    miniMode?: boolean;
    miniKeyboardVisible?: boolean;
    miniKeyboardHeightRatio?: number;
    heightRatio?: number;
  },
) {
  const fullWorkArea = teachingFullWorkAreaActive(settings, musicTeachingEnabled);
  return {
    monitorId: settings.accessibilityMonitorId,
    collapsed: extras?.collapsed ?? settings.collapsed,
    collapsedDictation: extras?.collapsedDictation ?? false,
    collapsedSettings: extras?.collapsedSettings,
    heightRatio:
      extras?.heightRatio ?? heightRatioFromSettings(settings, musicTeachingEnabled),
    miniMode: extras?.miniMode,
    miniKeyboardVisible: extras?.miniKeyboardVisible,
    miniKeyboardHeightRatio: extras?.miniKeyboardHeightRatio,
    fullWorkArea,
  };
}

async function syncWindowLayoutFromSettings(
  settings: AppSettings,
  preferAnimate: boolean,
  musicTeachingEnabled = false,
) {
  const args = windowLayoutInvokeArgs(settings, musicTeachingEnabled);
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
  greekPendingAccent: GreekPendingAccent | null;
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
  /** Session-only: which lesson fills the teaching slot. */
  teachingLesson: TeachingLesson;
  /** Session-only: typing mode to restore when leaving Teaching. */
  modeBeforeTeaching: "normal" | "mini" | null;
  /** Session-only: height ratio captured before Teaching (incl. unset). */
  windowHeightRatioBeforeTeaching: WindowHeightRatioBeforeTeaching;
  /** Session-only: companion tablet mode is selected while a live session exists. */
  companionModeActive: boolean;
  /** Session-only: host mode to restore when leaving Companion. */
  modeBeforeCompanion: HostAppMode | null;
  /**
   * Session-only: true while a tablet session is active or reconnecting.
   */
  companionSessionLive: boolean;
  /** Live JPEG data URL of the focused external input, or null when idle. */
  inputPreviewFrame: string | null;
  /** Session-only: bridge listener is up (armed). Cleared only by caregiver leave/Stop. */
  companionBridgeArmed: boolean;
  /** Session-only: restore mouse after leaving 5-octave (wide) piano mode. */
  mouseVisibleBeforeWidePiano: boolean | null;
  /** Session-only: restore mouse after leaving Mini Mode. */
  mouseVisibleBeforeMiniMode: boolean | null;
  /** Persisted imported songs (app data library). */
  importedSongs: ImportedMusicSong[];
  /** Persisted caregiver-created spelling lists. */
  customLanguagePacks: LanguagePack[];
  /** Session-only: active language spelling pack. */
  languagePackId: string | null;
  languageTaskIndex: number;
  languageInputBuffer: string;
  languageAnswerIncorrect: boolean;
  /** Session-only: spelling lesson in progress (Play), like musicPlaybackActive. */
  languageLessonPlaying: boolean;
  /** Session-only: keyboard routes into the new custom list form. */
  languageListAuthoringActive: boolean;
  languageListAuthoringField: LanguageListAuthoringField;
  languageListAuthoringHandlers: LanguageListAuthoringHandlers | null;
  /** Session-only: Language subject tab (Spelling | Free write). */
  languageSubjectTab: LanguageSubjectTab;
  /** Session-only: Free write pane focus target. */
  freeWriteFocus: FreeWriteFocus;
  /** Global teaching PDF library (app data). */
  teachingPdfLibrary: TeachingPdfEntry[];
  /** Session-only: active Free write PDF id. */
  freeWriteActivePdfId: string | null;
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
  typeCharacter: (
    output: string,
    options?: { physicalKey?: string },
  ) => string | null;
  applyTypedLayoutTranslation: (
    translation: LayoutKeyTranslation,
    options?: { physicalKey?: string; shift?: boolean; fallbackOutput?: string },
  ) => string | null;
  applyLanguageLayoutTranslation: (
    translation: LayoutKeyTranslation,
    options?: { physicalKey?: string; shift?: boolean; fallbackOutput?: string },
  ) => void;
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
  /** Select Normal / Mini / Teaching / Companion tablet mode. */
  setAppMode: (
    mode: AppModeTablet,
    options?: { skipCompanionBridgeStop?: boolean },
  ) => Promise<void>;
  /**
   * Sync host chrome with tablet companion session phase (force companion /
   * restore prior mode). Call from main-window event listeners only.
   */
  applyCompanionSessionPhase: (phase: CompanionSessionPhase) => Promise<void>;
  /** Settings Stop: kill the bridge and restore the previous host mode if live. */
  stopCompanionByCaregiver: () => Promise<void>;
  setTeachingLesson: (lesson: TeachingLesson) => void;
  applyTeachingSession: (payload: TeachingSessionPayload) => void;
  broadcastTeachingSession: () => Promise<void>;
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
  loadCustomLanguagePacks: () => Promise<void>;
  createCustomLanguagePack: (pack: LanguagePack) => Promise<void>;
  deleteCustomLanguagePack: (id: string) => Promise<void>;
  setLanguagePackId: (id: string) => void;
  restartLanguageLesson: () => void;
  startLanguageLessonPlayback: () => void;
  stopLanguageLessonPlayback: () => void;
  setLanguageListAuthoringActive: (active: boolean) => void;
  setLanguageListAuthoringField: (field: LanguageListAuthoringField) => void;
  registerLanguageListAuthoringHandlers: (
    handlers: LanguageListAuthoringHandlers | null,
  ) => void;
  languageKeyInput: (ch: string, options?: { physicalKey?: string }) => void;
  languageBackspace: () => void;
  checkLanguageAnswer: () => void;
  setLanguageSubjectTab: (tab: LanguageSubjectTab) => void;
  setFreeWriteFocus: (focus: FreeWriteFocus) => void;
  freeWriteNotepadInput: (ch: string) => void;
  freeWriteNotepadBackspace: () => void;
  setFreeWriteNotepadText: (text: string) => void;
  clearFreeWriteNotepad: () => void;
  setFreeWriteNotepadZoom: (zoom: number) => void;
  setFreeWriteNotepadWrap: (wrap: boolean) => void;
  setFreeWriteNotepadLineNumbers: (on: boolean) => void;
  loadTeachingPdfLibrary: () => Promise<void>;
  pickTeachingPdf: () => Promise<void>;
  openTeachingPdf: (id: string) => Promise<void>;
  removeTeachingPdf: (id: string) => Promise<void>;
  isAnimatingWindow: boolean;
  pendingUpdate: Update | null;
  updateCheckStatus: "idle" | "checking" | "upToDate" | "error";
  /** Populated when updateCheckStatus is "error". */
  updateCheckError: string | null;
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
    // suggestionsVisible and predictionEnabled are toggled together in Settings.
    const legacyFill: Partial<AppSettings> = {
      predictionEnabled:
        parsed.predictionEnabled ??
        parsed.suggestionsVisible ??
        true,
      quickActionsVisible: parsed.quickActionsVisible ?? true,
      phrasesVisible: parsed.phrasesVisible ?? true,
      suggestionsVisible: parsed.suggestionsVisible ?? true,
      dictationVisible: parsed.dictationVisible ?? true,
      inputPreviewVisible: parsed.inputPreviewVisible ?? true,
      inputPreviewMiniModeVisible: parsed.inputPreviewMiniModeVisible ?? true,
      emergencyVisible: parsed.emergencyVisible ?? true,
      keyboardModeToggleVisible: parsed.keyboardModeToggleVisible ?? true,
    };
    // Mini Auto dropped: null / missing override → Normal (false).
    const miniModeOverride =
      parsed.miniModeOverride === true
        ? true
        : false;
    // Teaching is session-only; never hydrate synthesizer under Normal/Mini.
    const keyboardSectionMode = coercePersistedKeyboardSectionMode(
      parsed.keyboardSectionMode,
      false,
    );
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ...legacyFill,
      typingLanguage,
      uiLanguage,
      colorProfile,
      mousePanelSide,
      miniModeOverride,
      keyboardSectionMode,
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

async function syncInputPreviewEnabled(get: () => AppStore): Promise<void> {
  if (WebviewWindow.getCurrent().label !== "main") {
    return;
  }
  const { settings, miniModeActive } = get();
  await invoke("cmd_set_input_preview_enabled", {
    enabled: isInputPreviewActiveForMode(settings, miniModeActive),
  });
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
  let migratedMiniAuto = false;
  let migratedKeyboardSectionMode = false;
  if (active) {
    try {
      const raw = JSON.parse(active.settings_json) as {
        miniModeOverride?: unknown;
        keyboardSectionMode?: unknown;
      };
      migratedMiniAuto = raw.miniModeOverride == null;
      migratedKeyboardSectionMode = needsKeyboardSectionModeMigration(
        raw.keyboardSectionMode,
        get().musicTeachingEnabled,
      );
    } catch {
      migratedMiniAuto = false;
      migratedKeyboardSectionMode = false;
    }
  }
  const parsed = active ? parseSettings(active.settings_json) : DEFAULT_SETTINGS;
  const settings = withV1EffectiveChrome({
    ...parsed,
    keyboardSectionMode: hydrateKeyboardSectionMode(
      parsed.keyboardSectionMode,
      get().musicTeachingEnabled,
    ),
  });
  set({ settings, settingsEpoch: get().settingsEpoch + 1 });
  const isMainWindow = WebviewWindow.getCurrent().label === "main";
  if (isMainWindow) {
    await invoke("cmd_set_system_language", { language: settings.typingLanguage });
    await get().pollKeyboardState();
    await syncInputPreviewEnabled(get);
  }
  await get().loadQuickActions();
  await get().loadPhrases();
  await get().loadMacros();
  if (migratedMiniAuto || migratedKeyboardSectionMode) {
    const epoch = get().settingsEpoch;
    await persistSettingsIfCurrent(get, epoch, get().settings);
  }
  if (isMainWindow) {
    await refreshMiniModeState({ animate: options?.animateLayout === true });
    if (!get().miniModeActive) {
      await syncWindowLayoutFromSettings(
        get().settings,
        options?.animateLayout === true,
        get().musicTeachingEnabled,
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
    settingsJson: JSON.stringify(settingsForPersist(settings)),
  });
  return get().profileHydrated && get().settingsEpoch === epoch;
}

async function emitTeachingSession(get: () => AppStore): Promise<void> {
  if (WebviewWindow.getCurrent().label !== "main") {
    return;
  }
  const state = get();
  await emit(TEACHING_SESSION_EVENT, {
    musicTeachingEnabled: state.musicTeachingEnabled,
    teachingLesson: state.teachingLesson,
    keyboardSectionMode: teachingSessionKeyboardMode(state.musicTeachingEnabled),
  } satisfies TeachingSessionPayload);
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
  greekPendingAccent: null,
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
  teachingLesson: "language",
  modeBeforeTeaching: null,
  windowHeightRatioBeforeTeaching: null,
  companionModeActive: false,
  modeBeforeCompanion: null,
  companionSessionLive: false,
  inputPreviewFrame: null,
  companionBridgeArmed: false,
  mouseVisibleBeforeWidePiano: null,
  mouseVisibleBeforeMiniMode: null,
  importedSongs: [],
  customLanguagePacks: [],
  languagePackId: null,
  languageTaskIndex: 0,
  languageInputBuffer: "",
  languageAnswerIncorrect: false,
  languageLessonPlaying: false,
  languageListAuthoringActive: false,
  languageListAuthoringField: "title",
  languageListAuthoringHandlers: null,
  languageSubjectTab: "spelling",
  freeWriteFocus: "notepad",
  teachingPdfLibrary: [],
  freeWriteActivePdfId: null,
  miniModeActive: false,
  miniModeKeyboardVisible: false,
  miniModeManualExpand: false,
  miniModeSuppressAutoShow: false,
  isAnimatingWindow: false,
  pendingUpdate: null,
  updateCheckStatus: "idle",
  updateCheckError: null,

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
    const nextActive = await invoke<string>("cmd_delete_profile_file", { filename });
    set({
      typedBuffer: "",
      ...clearGreekPendingAccent(),
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
      (partial.windowHeightRatio == null ||
        partial.windowHeightRatio < 0.999)
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
      const modeBefore = get().modeBeforeTeaching;
      const heightBefore = get().windowHeightRatioBeforeTeaching;
      set({
        musicTeachingEnabled: false,
        musicNoteIndex: 0,
        musicPlaybackActive: false,
        phrasesVisibleBeforeTeaching: null,
        modeBeforeTeaching: null,
        windowHeightRatioBeforeTeaching: null,
        ...emptyLanguageLessonState(),
      });
      if (before !== null) {
        next = { ...next, phrasesVisible: before };
      }
      // Restore saved typing mode + height when Teaching exits via keyboardSectionMode.
      if (modeBefore === "mini") {
        next = { ...next, miniModeOverride: true };
      } else if (modeBefore === "normal") {
        next = { ...next, miniModeOverride: false };
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

    next = withV1EffectiveChrome(next);

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
      void invoke("cmd_reset_layout_compose_state", {
        hkl: get().physicalKeyState.systemHkl || null,
      });
      set({ typedBuffer: "", suggestions: [], ...clearGreekPendingAccent() });
      await get().refreshSttCapability();
    }
    if (partial.groqApiKey !== undefined) {
      await get().refreshSttCapability();
    }
    if (uiLanguageChanged) {
      set({ typedBuffer: "", suggestions: [], ...clearGreekPendingAccent() });
      await get().loadPhrases();
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
      partial.inputPreviewMiniModeVisible !== undefined
    ) {
      await syncInputPreviewEnabled(get);
    }
    if (WebviewWindow.getCurrent().label === "main") {
      const current = get().settings;
      const visibilityChanged =
        partial.phrasesVisible !== undefined ||
        partial.quickActionsVisible !== undefined;
      // Transparent is CSS-only; do not trigger mini layout refresh/animation.
      const miniModeSettingChanged = partial.miniModeOverride !== undefined;
      if (miniModeSettingChanged || partial.accessibilityMonitorId !== undefined) {
        await refreshMiniModeState({ animate: true });
        // Monitor moves (and Teaching→Normal height/section patches) must still
        // re-apply non-mini layout when refresh is a no-op with Mini already off.
        if (
          shouldSyncNonMiniWindowLayout({
            miniModeActive: get().miniModeActive,
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
      } else if (get().miniModeActive) {
        if (
          partial.collapsed !== undefined ||
          Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio") ||
          visibilityChanged
        ) {
          if (Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")) {
            liveHeightRatioPreview = null;
          }
          await syncMiniModeWindowLayout(true);
        }
      } else if (
        partial.accessibilityMonitorId !== undefined ||
        partial.collapsed !== undefined ||
        Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")
      ) {
        if (Object.prototype.hasOwnProperty.call(partial, "windowHeightRatio")) {
          liveHeightRatioPreview = null;
        }
        await invoke("cmd_apply_window_layout", {
          monitorId: current.accessibilityMonitorId,
          collapsed: current.collapsed,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(current, get().musicTeachingEnabled),
          fullWorkArea: teachingFullWorkAreaActive(current, get().musicTeachingEnabled),
        });
      } else if (visibilityChanged && !current.collapsed) {
        await invoke("cmd_animate_window_layout", {
          monitorId: current.accessibilityMonitorId,
          collapsed: false,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(current, get().musicTeachingEnabled),
          fullWorkArea: teachingFullWorkAreaActive(current, get().musicTeachingEnabled),
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
        void syncWindowLayoutFromSettings(next, true, get().musicTeachingEnabled);
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
    const { settings, miniModeActive, musicTeachingEnabled } = get();
    if (settings.collapsed || miniModeActive) return;
    const heightRatio = Math.max(
      computeContentHeightRatioFromSettings(
        settings,
        lessonSlotVisibleFromState(settings, musicTeachingEnabled),
      ),
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
        fullWorkArea: teachingFullWorkAreaActive(
          latest,
          get().musicTeachingEnabled,
        ),
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

  setTypedBuffer: (text) => set({ typedBuffer: text, ...clearGreekPendingAccent() }),
  appendTyped: (ch) => set((s) => ({ typedBuffer: s.typedBuffer + ch })),
  typeCharacter: (output, options) => {
    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = processCharacterInput(
      state.typedBuffer,
      state.greekPendingAccent,
      output,
      { physicalKey: options?.physicalKey, greekCompose: greek },
    );
    set({
      typedBuffer: result.buffer,
      greekPendingAccent: result.pendingAccent,
    });
    return result.inject || null;
  },
  applyTypedLayoutTranslation: (translation, options) => {
    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = applyGreekLayoutTranslation(
      state.typedBuffer,
      state.greekPendingAccent,
      translation,
      {
        physicalKey: options?.physicalKey,
        shift: options?.shift,
        fallbackOutput: options?.fallbackOutput,
        greekCompose: greek,
      },
    );
    set({
      typedBuffer: result.buffer,
      greekPendingAccent: result.pending,
    });
    return result.inject || null;
  },
  applyLanguageLayoutTranslation: (translation, options) => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get()))) return;
    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = applyGreekLayoutTranslation(
      state.languageInputBuffer,
      state.greekPendingAccent,
      translation,
      {
        physicalKey: options?.physicalKey,
        shift: options?.shift,
        fallbackOutput: options?.fallbackOutput,
        greekCompose: greek,
      },
    );
    set({
      languageInputBuffer: result.buffer,
      greekPendingAccent: result.pending,
      languageAnswerIncorrect: false,
    });
  },
  backspaceTyped: () =>
    set((s) => {
      if (s.greekPendingAccent) {
        return clearGreekPendingAccent();
      }
      return { typedBuffer: s.typedBuffer.slice(0, -1) };
    }),

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
      set({ typedBuffer: "", suggestions: [], ...clearGreekPendingAccent() });
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
        set({ typedBuffer: "", suggestions: [], ...clearGreekPendingAccent() });
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
    if (!settings.suggestionsVisible || !settings.predictionEnabled) {
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
    if (isLanguageLessonActive(get())) return;
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
    if (!settings.suggestionsVisible || !settings.predictionEnabled) return;
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
    const state = get();
    const needsFocus =
      state.pendingUpdate !== null ||
      isLanguageLessonCaptureActive(languageLessonModeFromState(state)) ||
      isFreeWriteCaptureActive(freeWriteModeFromState(state));
    await invoke("cmd_set_window_focusable", { focusable: needsFocus });
  },

  setShowSettings: (show) => {
    void setToolWindowVisible(get, set, "settings", show);
  },
  setShowMacroBuilder: (show) => {
    if (show && isV1ToolWindowHidden("macro-builder")) {
      return;
    }
    void setToolWindowVisible(get, set, "macro-builder", show);
  },
  setShowHeadTrackingWizard: (show) => {
    if (show && isV1ToolWindowHidden("head-tracking")) {
      return;
    }
    void setToolWindowVisible(get, set, "head-tracking", show);
  },

  loadKeyboardLayout: async () => {
    const keyboardLayout = await invoke<string>("cmd_get_keyboard_layout");
    set({ keyboardLayout });
  },

  enableMusicTeaching: async () => {
    const { settings, musicTeachingEnabled, musicSongId, importedSongs, teachingLesson, languagePackId } = get();
    if (musicTeachingEnabled) return;
    set({
      musicTeachingEnabled: true,
      phrasesVisibleBeforeTeaching: settings.phrasesVisible,
      musicNoteIndex: 0,
      musicSongId: musicSongId ?? "twinkle",
      ...(teachingLesson === "language"
        ? initLanguageLessonState(settings, languagePackId, get().customLanguagePacks)
        : emptyLanguageLessonState()),
    });
    // Lesson slot does not depend on phrasesVisible — do not force it on.
    const song = getSongById(get().musicSongId, importedSongs);
    if (song) {
      const fit = songPianoRangeFit(song);
      if (fit) {
        await get().updateSettings({
          synthesizerOctaveCount: fit.octaveCount,
          synthesizerStartOctave: fit.startOctave,
        });
      }
    }
    void get().syncWindowFocusable();
  },

  setTeachingLesson: (lesson) => {
    const prev = get().teachingLesson;
    const nextState =
      lesson === "language" && get().musicTeachingEnabled
        ? initLanguageLessonState(get().settings, get().languagePackId, get().customLanguagePacks)
        : prev === "language"
          ? emptyLanguageLessonState()
          : {};
    set({ teachingLesson: lesson, ...nextState });
    void get().syncWindowFocusable();
    if (shouldDelegateAppModeToMain(WebviewWindow.getCurrent().label)) {
      void emit(TEACHING_LESSON_REQUEST_EVENT, {
        lesson,
      } satisfies TeachingLessonRequest);
      return;
    }
    void emitTeachingSession(get);
  },

  applyTeachingSession: (payload) => {
    set({
      musicTeachingEnabled: payload.musicTeachingEnabled,
      teachingLesson: payload.teachingLesson,
      settings: {
        ...get().settings,
        keyboardSectionMode: payload.keyboardSectionMode,
      },
    });
  },

  broadcastTeachingSession: async () => {
    await emitTeachingSession(get);
  },

  applyCompanionSessionPhase: async (phase) => {
    const mapped = mapCompanionSessionPhase(phase, get().modeBeforeCompanion);
    if (mapped.live) {
      if (get().companionSessionLive) {
        return;
      }
      const current = get();
      const teachingActive =
        current.musicTeachingEnabled &&
        current.settings.keyboardSectionMode === "synthesizer";
      const captured = captureModeBeforeCompanion(
        resolveSelectedAppMode({
          companionModeActive: current.companionModeActive,
          teachingActive,
          miniModeOverride: current.settings.miniModeOverride ?? undefined,
        }),
      );
      set({
        companionSessionLive: true,
        companionModeActive: true,
        companionBridgeArmed: true,
        ...(captured != null ? { modeBeforeCompanion: captured } : {}),
      });
      return;
    }
    if (shouldIgnoreCompanionIdle(get().companionModeActive)) {
      return;
    }
    set({
      companionSessionLive: false,
      companionModeActive: false,
      modeBeforeCompanion: null,
      companionBridgeArmed: true,
    });
    await get().setAppMode(mapped.restore, { skipCompanionBridgeStop: true });
  },

  stopCompanionByCaregiver: async () => {
    const current = get();
    const teachingActive =
      current.musicTeachingEnabled &&
      current.settings.keyboardSectionMode === "synthesizer";
    const selected = resolveSelectedAppMode({
      companionModeActive: current.companionModeActive,
      teachingActive,
      miniModeOverride: current.settings.miniModeOverride ?? undefined,
    });
    const host: HostAppMode =
      selected === "companion"
        ? restoreModeAfterCompanion(current.modeBeforeCompanion)
        : selected;
    await get().setAppMode(host);
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
              miniModeOverride: false,
            },
          });
          break;
        case "mini":
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
              miniModeOverride: true,
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
              miniModeOverride: false,
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
      if (shouldStopCompanionBridgeOnHostMode(companionBridgeArmed, companionModeActive)) {
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
        // Clear teaching first so leavingSynthesizer does not restore Mini.
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(state.windowHeightRatioBeforeTeaching)
          : settings.windowHeightRatio;
        if (inTeaching) {
          liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            phrasesVisibleBeforeTeaching: null,
            modeBeforeTeaching: null,
            windowHeightRatioBeforeTeaching: null,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          miniModeOverride: false,
          keyboardSectionMode: "keyboard",
          ...(inTeaching ? { windowHeightRatio: heightRestore } : {}),
        });
        // Explicit Normal must re-apply non-mini layout even if refresh was a no-op.
        await syncWindowLayoutFromSettings(get().settings, true, false);
        await emitTeachingSession(get);
        return;
      }
      case "mini": {
        set({ companionModeActive: false });
        const heightRestore = inTeaching
          ? heightRatioAfterLeavingTeaching(state.windowHeightRatioBeforeTeaching)
          : undefined;
        if (inTeaching) {
          liveHeightRatioPreview = null;
          set({
            musicTeachingEnabled: false,
            musicNoteIndex: 0,
            musicPlaybackActive: false,
            phrasesVisibleBeforeTeaching: null,
            modeBeforeTeaching: null,
            windowHeightRatioBeforeTeaching: null,
            ...emptyLanguageLessonState(),
          });
        }
        await get().updateSettings({
          miniModeOverride: true,
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
        const previousMode: "normal" | "mini" =
          settings.miniModeOverride === true ? "mini" : "normal";
        set({
          modeBeforeTeaching: previousMode,
          windowHeightRatioBeforeTeaching: captureWindowHeightRatioBeforeTeaching(
            settings.windowHeightRatio,
          ),
          teachingLesson: "language",
        });
        // Flags on before synthesizer patch so first layout sync sees Teaching.
        await get().enableMusicTeaching();
        const sectionStack = ensureSectionExpanded(
          resolveSectionStack(
            get().settings.sectionStack,
            get().settings.sectionLayouts,
          ),
          "phrases",
        );
        await get().updateSettings({
          miniModeOverride: false,
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
      ...emptyLanguageLessonState(),
    });
    if (options?.hidePhrases) {
      await get().updateSettings({ phrasesVisible: false });
      return;
    }
    if (before !== null && before !== get().settings.phrasesVisible) {
      await get().updateSettings({ phrasesVisible: before });
    }
    await emitTeachingSession(get);
    void get().syncWindowFocusable();
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

  setLanguagePackId: (id) => {
    if (!getLanguagePackById(id, get().customLanguagePacks)) return;
    set({
      languagePackId: id,
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying: false,
      ...clearGreekPendingAccent(),
    });
  },

  restartLanguageLesson: () => {
    set({
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying: false,
      ...clearGreekPendingAccent(),
    });
  },

  startLanguageLessonPlayback: () => {
    const state = get();
    if (!isLanguageLessonActive(languageLessonModeFromState(state))) return;
    const pack = getLanguagePackById(state.languagePackId, state.customLanguagePacks);
    if (!pack || pack.tasks.length === 0) return;
    set({
      languageLessonPlaying: true,
      languageTaskIndex: 0,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      ...clearGreekPendingAccent(),
    });
    void get().syncWindowFocusable();
  },

  stopLanguageLessonPlayback: () => {
    if (!get().languageLessonPlaying) return;
    set({ languageLessonPlaying: false });
    void get().syncWindowFocusable();
  },

  setLanguageListAuthoringActive: (active) => {
    set({
      languageListAuthoringActive: active,
      ...(active
        ? { languageLessonPlaying: false, languageListAuthoringField: "title" as const }
        : {
            languageListAuthoringField: "title" as const,
            languageListAuthoringHandlers: null,
          }),
    });
    void get().syncWindowFocusable();
  },

  setLanguageListAuthoringField: (field) => {
    set({ languageListAuthoringField: field });
  },

  registerLanguageListAuthoringHandlers: (handlers) => {
    set({ languageListAuthoringHandlers: handlers });
  },

  languageKeyInput: (ch, options) => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get()))) return;

    const state = get();
    const greek = greekComposeEnabled(greekComposeContextFromState(state));
    const result = processCharacterInput(
      state.languageInputBuffer,
      state.greekPendingAccent,
      ch,
      { physicalKey: options?.physicalKey, greekCompose: greek },
    );
    set({
      languageInputBuffer: result.buffer,
      greekPendingAccent: result.pendingAccent,
      languageAnswerIncorrect: false,
    });
  },

  languageBackspace: () => {
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(get()))) return;
    set((state) => {
      if (state.greekPendingAccent) {
        return {
          ...clearGreekPendingAccent(),
          languageAnswerIncorrect: false,
        };
      }
      return {
        languageInputBuffer: state.languageInputBuffer.slice(0, -1),
        languageAnswerIncorrect: false,
      };
    });
  },

  checkLanguageAnswer: () => {
    const state = get();
    if (!isLanguageLessonSpellingActive(languageLessonModeFromState(state))) return;
    const pack = getLanguagePackById(state.languagePackId, state.customLanguagePacks);
    if (!pack) return;
    const expected = currentSpellAnswer(pack, state.languageTaskIndex);
    if (!expected) return;
    const ignoreCase = state.settings.languageLessonIgnoreCase !== false;
    const ignoreTones = state.settings.languageLessonIgnoreTones !== false;
    if (
      !languageAnswersMatch(
        state.languageInputBuffer,
        expected,
        pack.lessonLanguage,
        { ignoreCase, ignoreTones },
      )
    ) {
      set({ languageAnswerIncorrect: true });
      return;
    }
    set({
      languageTaskIndex: state.languageTaskIndex + 1,
      languageInputBuffer: "",
      languageAnswerIncorrect: false,
      languageLessonPlaying:
        state.languageTaskIndex + 1 >= pack.tasks.length
          ? false
          : state.languageLessonPlaying,
      ...clearGreekPendingAccent(),
    });
  },

  setLanguageSubjectTab: (tab) => {
    if (tab !== "spelling" && get().languageLessonPlaying) {
      get().stopLanguageLessonPlayback();
    }
    set({
      languageSubjectTab: tab,
      freeWriteFocus: tab === "freeWrite" ? "notepad" : get().freeWriteFocus,
    });
    void get().syncWindowFocusable();
  },

  setFreeWriteFocus: (focus) => {
    set({ freeWriteFocus: focus });
    void get().syncWindowFocusable();
  },

  freeWriteNotepadInput: (ch) => {
    if (!isFreeWriteCaptureActive(freeWriteModeFromState(get()))) return;
    const text = get().settings.freeWriteNotepadText ?? "";
    void get().updateSettings({ freeWriteNotepadText: text + ch });
  },

  freeWriteNotepadBackspace: () => {
    if (!isFreeWriteCaptureActive(freeWriteModeFromState(get()))) return;
    const text = get().settings.freeWriteNotepadText ?? "";
    if (!text) return;
    void get().updateSettings({ freeWriteNotepadText: text.slice(0, -1) });
  },

  setFreeWriteNotepadText: (text) => {
    void get().updateSettings({ freeWriteNotepadText: text });
  },

  clearFreeWriteNotepad: () => {
    void get().updateSettings({ freeWriteNotepadText: "" });
  },

  setFreeWriteNotepadZoom: (zoom) => {
    void get().updateSettings({ freeWriteNotepadZoom: clampFreeWriteZoom(zoom) });
  },

  setFreeWriteNotepadWrap: (wrap) => {
    void get().updateSettings({ freeWriteNotepadWrap: wrap });
  },

  setFreeWriteNotepadLineNumbers: (on) => {
    void get().updateSettings({ freeWriteNotepadLineNumbers: on });
  },

  loadTeachingPdfLibrary: async () => {
    try {
      const entries = await invoke<TeachingPdfEntry[]>("cmd_list_teaching_pdfs");
      const teachingPdfLibrary = Array.isArray(entries)
        ? entries.filter((e) => e && typeof e.id === "string" && typeof e.path === "string")
        : [];
      const lastId = get().settings.freeWriteLastPdfId ?? null;
      const freeWriteActivePdfId =
        lastId && teachingPdfLibrary.some((e) => e.id === lastId)
          ? lastId
          : get().freeWriteActivePdfId;
      set({ teachingPdfLibrary, freeWriteActivePdfId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  pickTeachingPdf: async () => {
    try {
      const path = await invoke<string | null>("cmd_pick_teaching_pdf");
      if (!path) return;
      const existing = get().teachingPdfLibrary.find((e) => e.path === path);
      const entry: TeachingPdfEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        title: teachingPdfFileName(path),
        path,
        lastOpenedAt: new Date().toISOString(),
      };
      const teachingPdfLibrary = upsertTeachingPdfEntry(get().teachingPdfLibrary, entry);
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      set({ teachingPdfLibrary, freeWriteActivePdfId: entry.id });
      await get().updateSettings({ freeWriteLastPdfId: entry.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  openTeachingPdf: async (id) => {
    const entry = get().teachingPdfLibrary.find((e) => e.id === id);
    if (!entry) return;
    try {
      const updated: TeachingPdfEntry = {
        ...entry,
        lastOpenedAt: new Date().toISOString(),
      };
      const teachingPdfLibrary = upsertTeachingPdfEntry(get().teachingPdfLibrary, updated);
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      set({ teachingPdfLibrary, freeWriteActivePdfId: id });
      await get().updateSettings({ freeWriteLastPdfId: id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  removeTeachingPdf: async (id) => {
    try {
      const teachingPdfLibrary = removeTeachingPdfEntry(get().teachingPdfLibrary, id);
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      const freeWriteActivePdfId =
        get().freeWriteActivePdfId === id ? null : get().freeWriteActivePdfId;
      set({ teachingPdfLibrary, freeWriteActivePdfId });
      if (get().settings.freeWriteLastPdfId === id) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
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

  loadCustomLanguagePacks: async () => {
    try {
      const packs = await invoke<LanguagePack[]>("cmd_list_custom_language_packs");
      set({
        customLanguagePacks: Array.isArray(packs)
          ? packs.filter((pack) => pack && typeof pack.id === "string")
          : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  createCustomLanguagePack: async (pack) => {
    try {
      await invoke("cmd_upsert_custom_language_pack", { pack });
      await get().loadCustomLanguagePacks();
      get().setLanguagePackId(pack.id);
      notify.success(pack.title);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },

  deleteCustomLanguagePack: async (id) => {
    const pack = get().customLanguagePacks.find((entry) => entry.id === id);
    if (!pack) return;
    try {
      await invoke("cmd_delete_custom_language_pack", { id });
      await get().loadCustomLanguagePacks();
      if (get().languagePackId === id) {
        const { settings } = get();
        const band = settings.languageLessonAgeBand ?? DEFAULT_LANGUAGE_AGE_BAND;
        const language = settings.languageLessonLanguage ?? "el";
        get().setLanguagePackId(defaultLanguagePackId(band, language));
      }
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
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(next, get().musicTeachingEnabled),
          fullWorkArea: teachingFullWorkAreaActive(next, get().musicTeachingEnabled),
        });
      } else {
        await invoke("cmd_animate_window_layout", {
          monitorId: settings.accessibilityMonitorId,
          collapsed: false,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(settings, get().musicTeachingEnabled),
          fullWorkArea: teachingFullWorkAreaActive(
            settings,
            get().musicTeachingEnabled,
          ),
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

void listen<{ data_url: string }>("input-preview-frame", (event) => {
  useAppStore.setState({ inputPreviewFrame: event.payload.data_url });
});

void listen("input-preview-cleared", () => {
  useAppStore.setState({ inputPreviewFrame: null });
});

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
