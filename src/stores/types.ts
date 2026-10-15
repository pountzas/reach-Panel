import type { Update } from "@tauri-apps/plugin-updater";
import type {
  InputMethod,
  LayoutKeyLabel,
  PhysicalKeyState,
} from "../lib/keyboardLayouts";
import type {
  AppSettings,
  MonitorInfo,
  PointerInputKind,
  ProfileFileInfo,
} from "../lib/types";
import type { ImportedMusicSong } from "../lib/music/importTypes";
import type {
  FreeWriteFocus,
  LanguageSubjectTab,
  PdfAnnotationDoc,
  TeachingPdfEntry,
} from "../lib/teaching";
import type { GreekPendingAccent } from "../lib/language/greekCompose";
import type { LanguagePack } from "../lib/language/types";
import type { LayoutKeyTranslation } from "../lib/layoutKeyTranslation";
import type {
  AppModeTablet,
  CompanionSessionPhase,
  TeachingSessionPayload,
  WindowHeightRatioBeforeTeaching,
} from "../lib/appModeLayout";
import type {
  RestorePatch,
  RestoreReason,
  RestoreStackEntry,
} from "./lib/restoreStack";

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

export type TeachingLesson = "music" | "math" | "language";

export type DictationState = "idle" | "listening" | "processing";

export interface SttCapability {
  engine: "winrt" | "groq" | null;
  groqConfigured: boolean;
  winrtSupported: boolean;
  online: boolean;
  canDictate: boolean;
}

export interface ErrorsSlice {
  lastError: string | null;
  setLastError: (error: string | null) => void;
}

export interface SuggestionsSlice {
  suggestions: string[];
  loadSuggestions: () => Promise<void>;
  applySuggestion: (word: string) => Promise<void>;
  recordTypedWord: () => Promise<void>;
}

export interface DictationSlice {
  dictationState: DictationState;
  sttCapability: SttCapability | null;
  setDictationState: (state: DictationState) => void;
  setSttCapability: (capability: SttCapability | null) => void;
  refreshSttCapability: () => Promise<void>;
  toggleDictation: () => Promise<void>;
  stopDictation: () => Promise<void>;
}

export interface CompanionSlice {
  companionModeActive: boolean;
  companionSessionLive: boolean;
  inputPreviewFrame: string | null;
  externalInputFocused: boolean;
  companionBridgeArmed: boolean;
  applyCompanionSessionPhase: (phase: CompanionSessionPhase) => Promise<void>;
  stopCompanionByCaregiver: () => Promise<void>;
}

export interface TeachingSlice {
  musicTeachingEnabled: boolean;
  musicSongId: string | null;
  musicNoteIndex: number;
  musicPlaybackActive: boolean;
  teachingLesson: TeachingLesson;
  importedSongs: ImportedMusicSong[];
  customLanguagePacks: LanguagePack[];
  languagePackId: string | null;
  languageTaskIndex: number;
  languageInputBuffer: string;
  languageAnswerIncorrect: boolean;
  languageLessonPlaying: boolean;
  languageListAuthoringActive: boolean;
  languageListAuthoringField: LanguageListAuthoringField;
  languageListAuthoringHandlers: LanguageListAuthoringHandlers | null;
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
  teachingPdfLibrary: TeachingPdfEntry[];
  freeWriteActivePdfId: string | null;
  freeWritePdfTool: "pen" | "eraser" | "text";
  freeWriteAnnotationDoc: PdfAnnotationDoc;
  freeWriteSelectedTextId: string | null;
  freeWriteAnnotationDirty: boolean;
  freeWriteUndoDepth: number;
  enableMusicTeaching: () => Promise<void>;
  disableMusicTeaching: () => Promise<void>;
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
  applyFreeWriteLayoutTranslation: (
    translation: LayoutKeyTranslation,
    options?: {
      physicalKey?: string;
      shift?: boolean;
      fallbackOutput?: string;
    },
  ) => void;
  setFreeWriteNotepadText: (text: string) => void;
  clearFreeWriteNotepad: () => void;
  setFreeWriteNotepadZoom: (zoom: number) => void;
  setFreeWriteNotepadWrap: (wrap: boolean) => void;
  setFreeWriteNotepadLineNumbers: (on: boolean) => void;
  loadTeachingPdfLibrary: () => Promise<void>;
  pickTeachingPdf: () => Promise<void>;
  closeTeachingPdf: () => Promise<void>;
  setFreeWritePdfTool: (tool: "pen" | "eraser" | "text") => void;
  setFreeWriteSelectedTextId: (id: string | null) => void;
  loadFreeWriteAnnotations: (path: string | null) => Promise<void>;
  scheduleSaveFreeWriteAnnotations: () => void;
  flushFreeWriteAnnotations: () => Promise<void>;
  clearAllFreeWriteAnnotations: () => Promise<boolean>;
  applyFreeWriteAnnotationUpdater: (
    updater: (doc: PdfAnnotationDoc) => PdfAnnotationDoc,
    options?: { pushUndo?: boolean; undoFrom?: PdfAnnotationDoc },
  ) => void;
  undoFreeWriteAnnotation: () => void;
}

export interface TypingSlice {
  typedBuffer: string;
  greekPendingAccent: GreekPendingAccent | null;
  stickyModifiers: string[];
  physicalKeyState: PhysicalKeyState;
  keyboardLayout: string;
  inputMethods: InputMethod[];
  layoutKeyLabels: LayoutKeyLabel[];
  languagePickerOpen: boolean;
  setTypedBuffer: (text: string) => void;
  appendTyped: (ch: string) => void;
  typeCharacter: (
    output: string,
    options?: { physicalKey?: string },
  ) => string | null;
  applyTypedLayoutTranslation: (
    translation: LayoutKeyTranslation,
    options?: {
      physicalKey?: string;
      shift?: boolean;
      fallbackOutput?: string;
    },
  ) => string | null;
  applyLanguageLayoutTranslation: (
    translation: LayoutKeyTranslation,
    options?: {
      physicalKey?: string;
      shift?: boolean;
      fallbackOutput?: string;
    },
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
  loadKeyboardLayout: () => Promise<void>;
}

export interface WindowSlice {
  showSettings: boolean;
  isAnimatingWindow: boolean;
  pendingUpdate: Update | null;
  updateCheckStatus: "idle" | "checking" | "upToDate" | "error";
  updateCheckError: string | null;
  applyWindowHeightRatioLive: (ratio: number) => Promise<void>;
  setShowSettings: (show: boolean) => void;
  syncWindowFocusable: () => Promise<void>;
  toggleCollapsed: () => Promise<void>;
  setPendingUpdate: (update: Update | null) => void;
  checkForUpdates: () => Promise<void>;
}

export interface FocusModeSlice {
  focusModeActive: boolean;
  focusModeKeyboardVisible: boolean;
  focusContentAnim: "idle" | "enter" | "exit";
  focusModeManualExpand: boolean;
  focusModeSuppressAutoShow: boolean;
  modeMenuOpen: boolean;
  openModeMenu: () => Promise<void>;
  closeModeMenu: () => Promise<void>;
  refreshFocusModeState: (options?: { animate?: boolean }) => Promise<void>;
  expandFocusModeKeyboard: () => Promise<void>;
  collapseFocusModeKeyboard: () => Promise<void>;
}

export interface ModeSlice {
  /** LIFO session snapshots for nested mode/mouse restores. */
  restoreStack: RestoreStackEntry[];
  pushRestore: (
    reason: RestoreReason,
    patch: RestorePatch,
    options?: { replace?: boolean },
  ) => void;
  popRestore: (reason: RestoreReason) => RestorePatch | null;
  setAppMode: (
    mode: AppModeTablet,
    options?: { skipCompanionBridgeStop?: boolean },
  ) => Promise<void>;
}

/** Profile, settings, monitors — everything not owned by a named domain slice. */
export interface ProfileSlice {
  profileFiles: ProfileFileInfo[];
  activeProfileFile: string | null;
  settings: AppSettings;
  settingsEpoch: number;
  profileHydrated: boolean;
  pointerInputKind: PointerInputKind;
  monitors: MonitorInfo[];
  loadProfileFiles: () => Promise<void>;
  setProfileFile: (filename: string) => Promise<void>;
  createProfileFile: (filename: string, name: string) => Promise<void>;
  deleteProfileFile: (filename: string) => Promise<void>;
  updateSettings: (
    partial: Partial<AppSettings>,
    options?: { syncToSystem?: boolean },
  ) => Promise<void>;
  setPointerInputKind: (kind: PointerInputKind) => Promise<void>;
  handlePointerInputEvent: (pointerType: string) => void;
  resetSettingsToDefaults: () => Promise<void>;
  wipeActiveProfile: () => Promise<void>;
  loadMonitors: () => Promise<void>;
  saveActiveProfile: () => Promise<void>;
  pickBackgroundImage: () => Promise<void>;
}

export type AppStore = ErrorsSlice &
  SuggestionsSlice &
  DictationSlice &
  CompanionSlice &
  TeachingSlice &
  TypingSlice &
  WindowSlice &
  FocusModeSlice &
  ModeSlice &
  ProfileSlice;

export type { AppModeTablet, WindowHeightRatioBeforeTeaching };
export type { RestorePatch, RestoreReason, RestoreStackEntry };
