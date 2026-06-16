export type MouseSide = "right" | "left" | "floating";
export type MouseSpeed = "slow" | "medium" | "fast" | "custom";
export type MousePanelMode = "mouse" | "numpad";

export interface AppSettings {
  theme: string;
  opacity: number;
  language: string;
  mouseSide: MouseSide;
  mouseVisible: boolean;
  mousePanelMode: MousePanelMode;
  mousePanelWidth: number;
  keyboardKeySize: number;
  keyboardSpacing: number;
  keyboardFontSize?: number;
  keyboardBgColor?: string;
  keyboardKeyColor?: string;
  keyTextColor?: string;
  appBgColor?: string;
  headerBgColor?: string;
  headerTextColor?: string;
  mousePanelBgColor?: string;
  backgroundImagePath?: string;
  backgroundImageOpacity?: number;
  mouseSpeed: MouseSpeed;
  mouseCustomSpeed?: number;
  precisionMode: boolean;
  predictionEnabled: boolean;
  quickActionsVisible: boolean;
  phrasesVisible: boolean;
  suggestionsVisible: boolean;
  emergencyVisible: boolean;
  accessibilityMonitorId: number;
  collapsed: boolean;
  headTrackingEnabled: boolean;
  mouseAutoHide?: boolean;
  functionKeysEnabled: boolean;
}

export interface ProfileFileInfo {
  filename: string;
  name: string;
}

export const INTERNAL_PROFILE_ID = "active";

export interface Profile {
  id: string;
  name: string;
  settings_json: string;
  created_at: string;
}

export interface QuickAction {
  id: string;
  profile_id: string;
  label: string;
  target: string;
  action_type: "app" | "url";
  category: string;
  sort_order: number;
}

export interface Phrase {
  id: string;
  profile_id: string;
  category_id: string;
  text: string;
  action: "type" | "speak" | "both";
  is_favorite: boolean;
  is_emergency: boolean;
}

export interface PhraseCategory {
  id: string;
  profile_id: string;
  name: string;
  sort_order: number;
}

export interface MacroDef {
  id: string;
  profile_id: string;
  name: string;
}

export interface MacroStep {
  id: string;
  macro_id: string;
  step_order: number;
  action_type: string;
  payload_json: string;
}

export interface MonitorInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}

export interface CommandResult {
  success: boolean;
  error?: string;
}

export interface HeadTrackingSettings {
  sensitivity: number;
  deadZone: number;
  acceleration: number;
  smoothing: number;
  calibrated: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  opacity: 0.95,
  language: "en",
  mouseSide: "right",
  mouseVisible: true,
  mousePanelMode: "mouse",
  mousePanelWidth: 280,
  keyboardKeySize: 56,
  keyboardSpacing: 6,
  keyboardFontSize: 18,
  keyboardBgColor: "#e8edf2",
  keyboardKeyColor: "#ffffff",
  keyTextColor: "#1e293b",
  appBgColor: "#f1f5f9",
  headerBgColor: "#1e293b",
  headerTextColor: "#ffffff",
  mousePanelBgColor: "#f8fafc",
  backgroundImageOpacity: 0.35,
  mouseSpeed: "medium",
  precisionMode: false,
  predictionEnabled: true,
  quickActionsVisible: true,
  phrasesVisible: true,
  suggestionsVisible: true,
  emergencyVisible: true,
  accessibilityMonitorId: 0,
  collapsed: false,
  headTrackingEnabled: false,
  mouseAutoHide: false,
  functionKeysEnabled: false,
};

export const MAX_KEYBOARD_KEY_SIZE = 80;
