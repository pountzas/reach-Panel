import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_PHYSICAL_KEY_STATE,
  PhysicalKeyState,
} from "../lib/keyboardLayouts";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  MacroDef,
  MacroStep,
  MonitorInfo,
  Phrase,
  PhraseCategory,
  Profile,
  QuickAction,
} from "../lib/types";

interface AppStore {
  profiles: Profile[];
  activeProfileId: string | null;
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
  loadProfiles: () => Promise<void>;
  setActiveProfile: (id: string) => Promise<void>;
  updateSettings: (
    partial: Partial<AppSettings>,
    options?: { syncToSystem?: boolean },
  ) => Promise<void>;
  resetSettingsToDefaults: () => Promise<void>;
  loadMonitors: () => Promise<void>;
  loadQuickActions: () => Promise<void>;
  loadPhrases: () => Promise<void>;
  loadMacros: () => Promise<void>;
  setTypedBuffer: (text: string) => void;
  appendTyped: (ch: string) => void;
  backspaceTyped: () => void;
  toggleSticky: (modifier: string) => void;
  pollKeyboardState: () => Promise<void>;
  toggleLanguage: () => Promise<void>;
  clearSticky: () => void;
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
}

function parseSettings(json: string): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(json) };
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

export const useAppStore = create<AppStore>((set, get) => ({
  profiles: [],
  activeProfileId: null,
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

  loadProfiles: async () => {
    const profiles = await invoke<Profile[]>("cmd_get_profiles");
    const active = profiles[0]?.id ?? null;
    const settings = active
      ? parseSettings(profiles.find((p) => p.id === active)?.settings_json ?? "{}")
      : DEFAULT_SETTINGS;
    set({ profiles, activeProfileId: active, settings });
    if (active) {
      await invoke("cmd_set_system_language", { language: settings.language });
      await get().pollKeyboardState();
      await get().loadQuickActions();
      await get().loadPhrases();
      await get().loadMacros();
    }
  },

  setActiveProfile: async (id) => {
    const profile = get().profiles.find((p) => p.id === id);
    if (!profile) return;
    const settings = parseSettings(profile.settings_json);
    set({
      activeProfileId: id,
      settings,
      typedBuffer: "",
      stickyModifiers: [],
    });
    await invoke("cmd_set_system_language", { language: settings.language });
    await get().pollKeyboardState();
    await get().loadQuickActions();
    await get().loadPhrases();
    await get().loadMacros();
    await get().loadSuggestions();
  },

  updateSettings: async (partial, options) => {
    const { activeProfileId, settings } = get();
    if (!activeProfileId) return;
    const syncToSystem = options?.syncToSystem ?? true;
    const languageChanged =
      partial.language !== undefined && partial.language !== settings.language;
    const next = { ...settings, ...partial };
    set({ settings: next });
    if (syncToSystem && languageChanged) {
      await invoke("cmd_set_system_language", { language: partial.language! });
    }
    await invoke("cmd_update_profile_settings", {
      profileId: activeProfileId,
      settingsJson: JSON.stringify(next),
    });
    if (languageChanged) {
      set({ typedBuffer: "", suggestions: [] });
      await get().loadPhrases();
      await get().loadSuggestions();
    }
    if (partial.accessibilityMonitorId !== undefined) {
      await invoke("cmd_move_window_to_monitor", {
        monitorId: partial.accessibilityMonitorId,
      });
    }
    if (partial.collapsed !== undefined) {
      await invoke("cmd_set_collapsed", { collapsed: partial.collapsed });
    }
  },

  resetSettingsToDefaults: async () => {
    const { monitors, activeProfileId } = get();
    if (!activeProfileId) return;
    await get().updateSettings(buildDefaultSettings(monitors));
  },

  loadMonitors: async () => {
    const monitors = await invoke<MonitorInfo[]>("cmd_list_monitors");
    set({ monitors });
  },

  loadQuickActions: async () => {
    const { activeProfileId } = get();
    if (!activeProfileId) return;
    const quickActions = await invoke<QuickAction[]>("cmd_get_quick_actions", {
      profileId: activeProfileId,
    });
    set({ quickActions });
  },

  loadPhrases: async () => {
    const { activeProfileId, settings } = get();
    if (!activeProfileId) return;
    const [phrases, phraseCategories] = await Promise.all([
      invoke<Phrase[]>("cmd_get_phrases", {
        profileId: activeProfileId,
        language: settings.language,
      }),
      invoke<PhraseCategory[]>("cmd_get_phrase_categories", {
        profileId: activeProfileId,
      }),
    ]);
    set({ phrases, phraseCategories });
  },

  loadMacros: async () => {
    const { activeProfileId } = get();
    if (!activeProfileId) return;
    const macros = await invoke<MacroDef[]>("cmd_get_macros", {
      profileId: activeProfileId,
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
      const { activeProfileId } = get();
      if (activeProfileId) {
        await invoke("cmd_update_profile_settings", {
          profileId: activeProfileId,
          settingsJson: JSON.stringify(get().settings),
        });
      }
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

  loadSuggestions: async () => {
    const { activeProfileId, settings, typedBuffer } = get();
    if (!activeProfileId || !settings.predictionEnabled) {
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
      profileId: activeProfileId,
      prefix,
      language: settings.language,
    });
    set({ suggestions: results.map((r) => r.word) });
  },

  applySuggestion: async (word) => {
    const { activeProfileId, settings, typedBuffer } = get();
    const parts = typedBuffer.split(/\s+/);
    parts[parts.length - 1] = word;
    const next = parts.join(" ") + " ";
    set({ typedBuffer: next });
    await invoke("cmd_type_text", { text: word + " " });
    if (activeProfileId) {
      await invoke("cmd_record_word", {
        profileId: activeProfileId,
        word,
        language: settings.language,
      });
    }
    await get().loadSuggestions();
  },

  setLastError: (error) => set({ lastError: error }),
  pollError: async () => {
    const error = await invoke<string | null>("get_last_error");
    set({ lastError: error });
  },

  syncWindowFocusable: async () => {
    const { showSettings, showMacroBuilder, showHeadTrackingWizard } = get();
    const needsFocus = showSettings || showMacroBuilder || showHeadTrackingWizard;
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
    const collapsed = !get().settings.collapsed;
    await get().updateSettings({ collapsed });
  },
}));

export async function getMacroSteps(macroId: string): Promise<MacroStep[]> {
  return invoke<MacroStep[]>("cmd_get_macro_steps", { macroId });
}
