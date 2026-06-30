import type { SectionLayouts } from "./sectionLayouts";
import type { MouseSpeed } from "./mouseSpeed";
import type { ColorProfileId } from "./colorProfiles";

export type { MouseSpeed };
export type MousePanelMode = "mouse" | "numpad";
export type FnKeyMode = "one-shot" | "latched";
export type KeyboardSectionMode = "keyboard" | "synthesizer";

export interface AppSettings {
  colorProfile: ColorProfileId;
  opacity: number;
  language: string;
  mouseVisible: boolean;
  mousePanelMode: MousePanelMode;
  keyboardFontSize?: number;
  sectionLayouts?: SectionLayouts;
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
  fnKeyMode: FnKeyMode;
  keyboardSectionMode: KeyboardSectionMode;
  keyboardModeToggleVisible: boolean;
  synthesizerVolume?: number;
  synthesizerMuted?: boolean;
  /** Fraction of input-row width used by the mouse / numpad panel (0–1). */
  inputRowRightRatio?: number;
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
  colorProfile: "light-grey",
  opacity: 0.95,
  language: "en",
  mouseVisible: true,
  mousePanelMode: "mouse",
  keyboardFontSize: 18,
  sectionLayouts: {},
  keyboardBgColor: "#d1d5db",
  keyboardKeyColor: "#f3f4f6",
  keyTextColor: "#374151",
  appBgColor: "#e5e7eb",
  headerBgColor: "#6b7280",
  headerTextColor: "#ffffff",
  mousePanelBgColor: "#e5e7eb",
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
  fnKeyMode: "one-shot",
  keyboardSectionMode: "keyboard",
  keyboardModeToggleVisible: true,
  synthesizerVolume: 70,
  synthesizerMuted: false,
  inputRowRightRatio: 0.28,
};
