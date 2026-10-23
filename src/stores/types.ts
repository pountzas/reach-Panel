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
import type { MusicSong } from "../lib/music/songs";
import type {
  FreeWriteFocus,
  LanguageSubjectTab,
  PdfAnnotationChange,
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

export type SttCapability = {
  engine: "winrt" | "groq" | null;
  groqConfigured: boolean;
  winrtSupported: boolean;
  online: boolean;
  canDictate: boolean;
};

export type ErrorsSlice = {
  lastError: string | null;
  setLastError: (error: string | null) => void;
};

export type SuggestionsSlice = {
  suggestions: string[];
  loadSuggestions: () => Promise<void>;
  applySuggestion: (word: string) => Promise<void>;
  recordTypedWord: () => Promise<void>;
};

export type DictationSlice = {
  dictationState: DictationState;
  sttCapability: SttCapability | null;
  setDictationState: (state: DictationState) => void;
  setSttCapability: (capability: SttCapability | null) => void;
  refreshSttCapability: () => Promise<void>;
  toggleDictation: () => Promise<void>;
  stopDictation: () => Promise<void>;
};

export type CompanionSlice = {
  companionModeActive: boolean;
  companionSessionLive: boolean;
  externalInputFocused: boolean;
  companionBridgeArmed: boolean;
  applyCompanionSessionPhase: (phase: CompanionSessionPhase) => Promise<void>;
  stopCompanionByCaregiver: () => Promise<void>;
};

export type TeachingSlice = {
  musicTeachingEnabled: boolean;
  teachingLesson: TeachingLesson;
  languageSubjectTab: LanguageSubjectTab;
  freeWriteFocus: FreeWriteFocus;
  /** Ephemeral: Language/Math keyboard chrome minimize (not persisted). */
  teachingKeyboardMinimized: boolean;
  /** Ephemeral: Focus auto-minimize toggle (not persisted). */
  teachingKeyboardAutoFocus: boolean;
  enableMusicTeaching: () => Promise<void>;
  disableMusicTeaching: () => Promise<void>;
  setTeachingLesson: (lesson: TeachingLesson) => void;
  setTeachingKeyboardMinimized: (minimized: boolean) => void;
  setTeachingKeyboardAutoFocus: (autoFocus: boolean) => void;
  toggleTeachingKeyboardMinimized: () => void;
  toggleTeachingKeyboardAutoFocus: () => void;
  applyTeachingSession: (payload: TeachingSessionPayload) => void;
  broadcastTeachingSession: () => Promise<void>;
  setLanguageSubjectTab: (tab: LanguageSubjectTab) => void;
  setFreeWriteFocus: (focus: FreeWriteFocus) => void;
};

export type SpellingSlice = {
  languageTaskIndex: number;
  languageInputBuffer: string;
  languageAnswerIncorrect: boolean;
  languageLessonPlaying: boolean;
  languageListAuthoringActive: boolean;
  languageListAuthoringField: LanguageListAuthoringField;
  languageListAuthoringHandlers: LanguageListAuthoringHandlers | null;
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
};

export type LanguagePacksSlice = {
  customLanguagePacks: LanguagePack[];
  languagePackId: string | null;
  loadCustomLanguagePacks: () => Promise<void>;
  createCustomLanguagePack: (pack: LanguagePack) => Promise<void>;
  deleteCustomLanguagePack: (id: string) => Promise<void>;
  setLanguagePackId: (id: string) => void;
};

export type NotepadSlice = {
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
};

export type PdfSlice = {
  teachingPdfLibrary: TeachingPdfEntry[];
  freeWriteActivePdfId: string | null;
  freeWritePdfTool: "pointer" | "pen" | "eraser" | "text";
  freeWriteAnnotationDoc: PdfAnnotationDoc;
  freeWriteSelectedTextId: string | null;
  freeWriteAnnotationDirty: boolean;
  freeWriteUndoDepth: number;
  freeWriteRedoDepth: number;
  loadTeachingPdfLibrary: () => Promise<void>;
  pickTeachingPdf: () => Promise<void>;
  closeTeachingPdf: () => Promise<void>;
  setFreeWritePdfTool: (tool: "pointer" | "pen" | "eraser" | "text") => void;
  setFreeWriteSelectedTextId: (id: string | null) => void;
  beginFreeWritePdfTextEdit: (id: string) => void;
  loadFreeWriteAnnotations: (path: string | null) => Promise<void>;
  scheduleSaveFreeWriteAnnotations: () => void;
  flushFreeWriteAnnotations: () => Promise<boolean>;
  exportTeachingReachPdf: (from: number, to: number) => Promise<void>;
  clearAllFreeWriteAnnotations: () => Promise<boolean>;
  applyFreeWriteAnnotationUpdater: (
    updater: (doc: PdfAnnotationDoc) => PdfAnnotationDoc,
    options?: {
      pushUndo?: boolean;
      /** Per-gesture patch stored on the undo stack (not a full doc). */
      change?: PdfAnnotationChange;
    },
  ) => void;
  undoFreeWriteAnnotation: () => void;
  redoFreeWriteAnnotation: () => void;
};

export type PianoSlice = {
  musicNoteIndex: number;
  musicPlaybackActive: boolean;
  restartMusicLesson: () => void;
  reportMusicKeyPlayed: (keyId: string) => void;
  startMusicPlayback: () => void;
  stopMusicPlayback: () => void;
  setMusicPlaybackNoteIndex: (index: number) => void;
  finishMusicPlayback: () => void;
};

export type PartituresSlice = {
  musicSongId: string | null;
  importedSongs: ImportedMusicSong[];
  setMusicSongId: (songId: string) => Promise<void>;
  loadImportedSongs: () => Promise<void>;
  importMusicSongsFromFile: () => Promise<void>;
  deleteImportedSong: (id: string) => Promise<void>;
};

export type PianoRangeSlice = {
  fitPianoRangeForSong: (song: MusicSong) => Promise<void>;
};

export type TypingSlice = {
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
};

export type WindowSlice = {
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
};

export type FocusModeSlice = {
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
};

export type ModeSlice = {
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
};

/** Profile, settings, monitors — everything not owned by a named domain slice. */
export type ProfileSlice = {
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
  handlePointerInputEvent: (input: {
    pointerType: string;
    isPrimary: boolean;
    button: number;
  }) => void;
  resetSettingsToDefaults: () => Promise<void>;
  wipeActiveProfile: () => Promise<void>;
  loadMonitors: () => Promise<void>;
  saveActiveProfile: () => Promise<void>;
  pickBackgroundImage: () => Promise<void>;
};

export type AppStore = ErrorsSlice &
  SuggestionsSlice &
  DictationSlice &
  CompanionSlice &
  TeachingSlice &
  SpellingSlice &
  LanguagePacksSlice &
  NotepadSlice &
  PdfSlice &
  PianoSlice &
  PartituresSlice &
  PianoRangeSlice &
  TypingSlice &
  WindowSlice &
  FocusModeSlice &
  ModeSlice &
  ProfileSlice;

export type { AppModeTablet, WindowHeightRatioBeforeTeaching };
export type { RestorePatch, RestoreReason, RestoreStackEntry };
