import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate } from "../lib/updater";
import {
  DEFAULT_PHYSICAL_KEY_STATE,
  PhysicalKeyState,
} from "../lib/keyboardLayouts";
import {
  AppSettings,
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
import { resolveColorProfile } from "../lib/colorProfiles";

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
  showSettings: boolean;
  showMacroBuilder: boolean;
  showHeadTrackingWizard: boolean;
  keyboardLayout: string;
  loadProfileFiles: () => Promise<void>;
  setProfileFile: (filename: string) => Promise<void>;
  createProfileFile: (filename: string, name: string) => Promise<void>;
  updateSettings: (
    partial: Partial<AppSettings>,
    options?: { syncToSystem?: boolean },
  ) => Promise<void>;
  resetSettingsToDefaults: () => Promise<void>;
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
  setShowSettings: (show: boolean) => void;
  setShowMacroBuilder: (show: boolean) => void;
  setShowHeadTrackingWizard: (show: boolean) => void;
  syncWindowFocusable: () => Promise<void>;
  loadKeyboardLayout: () => Promise<void>;
  toggleCollapsed: () => Promise<void>;
  isAnimatingWindow: boolean;
  pendingUpdate: Update | null;
  updateCheckStatus: "idle" | "checking" | "upToDate" | "error";
  setPendingUpdate: (update: Update | null) => void;
  checkForUpdates: () => Promise<void>;
}

function parseSettings(json: string): AppSettings {
  try {
    const { theme, mouseSide, ...parsed } = JSON.parse(json) as Partial<AppSettings> & {
      theme?: unknown;
      mouseSide?: "left" | "right" | "floating";
    };
    const colorProfile = resolveColorProfile({ ...parsed, theme });
    const mousePanelSide =
      parsed.mousePanelSide ??
      (mouseSide === "left" ? "left" : DEFAULT_SETTINGS.mousePanelSide);
    return { ...DEFAULT_SETTINGS, ...parsed, colorProfile, mousePanelSide };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function buildDefaultSettings(monitors: MonitorInfo[]): AppSettings {
  const primary = monitors.find((m) => m.is_primary) ?? monitors[0];
  return {
    ...DEFAULT_SETTINGS,
    accessibilityMonitorId: primary?.id ?? DEFAULT_SETTINGS.accessibilityMonitorId,
  };
}

async function loadProfileData(
  set: (partial: Partial<AppStore>) => void,
  get: () => AppStore,
) {
  const profiles = await invoke<{ id: string; settings_json: string }[]>(
    "cmd_get_profiles",
  );
  const active = profiles.find((p) => p.id === INTERNAL_PROFILE_ID) ?? profiles[0];
  const settings = active
    ? parseSettings(active.settings_json)
    : DEFAULT_SETTINGS;
  set({ settings });
  await invoke("cmd_set_system_language", { language: settings.language });
  await get().pollKeyboardState();
  await get().loadQuickActions();
  await get().loadPhrases();
  await get().loadMacros();
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
  showSettings: false,
  showMacroBuilder: false,
  showHeadTrackingWizard: false,
  keyboardLayout: "QWERTY",
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
    await loadProfileData(set, get);
    await get().loadSuggestions();
  },

  createProfileFile: async (filename, name) => {
    await invoke("cmd_create_profile_file", { filename, name });
    await get().loadProfileFiles();
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
    const languageChanged =
      partial.language !== undefined && partial.language !== settings.language;
    const next = { ...settings, ...partial };
    set({ settings: next });
    if (syncToSystem && languageChanged) {
      await invoke("cmd_set_system_language", { language: partial.language! });
    }
    await invoke("cmd_update_profile_settings", {
      profileId: INTERNAL_PROFILE_ID,
      settingsJson: JSON.stringify(next),
    });
    if (languageChanged) {
      set({ typedBuffer: "", suggestions: [] });
      await get().loadPhrases();
      await get().loadSuggestions();
    }
    if (partial.accessibilityMonitorId !== undefined || partial.collapsed !== undefined) {
      await invoke("cmd_apply_window_layout", {
        monitorId: next.accessibilityMonitorId,
        collapsed: next.collapsed,
      });
    }
  },

  resetSettingsToDefaults: async () => {
    const { monitors } = get();
    await get().updateSettings(buildDefaultSettings(monitors));
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
        language: settings.language,
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

    const languageUnchanged = settings.language === next.systemLanguage;
    const layoutUnchanged = keyboardLayout === next.keyboardLayout;

    if (keysUnchanged && languageUnchanged && layoutUnchanged) {
      return;
    }

    set({
      physicalKeyState: next,
      keyboardLayout: next.keyboardLayout,
      ...(languageUnchanged
        ? {}
        : { settings: { ...settings, language: next.systemLanguage } }),
    });

    if (!languageUnchanged) {
      await invoke("cmd_update_profile_settings", {
        profileId: INTERNAL_PROFILE_ID,
        settingsJson: JSON.stringify(get().settings),
      });
      set({ typedBuffer: "", suggestions: [] });
      await get().loadPhrases();
      await get().loadSuggestions();
    }
  },

  toggleLanguage: async () => {
    const { settings } = get();
    const next = settings.language === "en" ? "el" : "en";
    await get().updateSettings({ language: next });
    await get().pollKeyboardState();
    await get().pollError();
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
      language: settings.language,
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
      language: settings.language,
    });
    await get().loadSuggestions();
  },

  setLastError: (error) => set({ lastError: error }),
  pollError: async () => {
    const error = await invoke<string | null>("get_last_error");
    set({ lastError: error });
  },

  syncWindowFocusable: async () => {
    const { showSettings, showMacroBuilder, showHeadTrackingWizard, pendingUpdate } =
      get();
    const needsFocus =
      showSettings || showMacroBuilder || showHeadTrackingWizard || pendingUpdate !== null;
    await invoke("cmd_set_window_focusable", { focusable: needsFocus });
  },

  setShowSettings: (show) => {
    set({ showSettings: show });
    void get().syncWindowFocusable();
  },
  setShowMacroBuilder: (show) => {
    set({ showMacroBuilder: show });
    void get().syncWindowFocusable();
  },
  setShowHeadTrackingWizard: (show) => {
    set({ showHeadTrackingWizard: show });
    void get().syncWindowFocusable();
  },

  loadKeyboardLayout: async () => {
    const keyboardLayout = await invoke<string>("cmd_get_keyboard_layout");
    set({ keyboardLayout });
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
        });
      } else {
        await invoke("cmd_animate_window_layout", {
          monitorId: settings.accessibilityMonitorId,
          collapsed: false,
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
