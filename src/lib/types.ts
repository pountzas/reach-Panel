import type { LegacySectionLayouts, SectionStackState } from "./sectionStack";
import type { MouseSpeed } from "./mouseSpeed";
import type { ColorProfileId } from "./colorProfiles";
import { COLOR_PROFILE_PRESETS } from "./colorProfiles";
import type { SynthOctaveCount } from "./music/octaveCount";

export type { MouseSpeed };
export type { SynthOctaveCount };
export type MousePanelMode = "mouse" | "numpad";
export type MousePanelSide = "left" | "right";
export type FnKeyMode = "one-shot" | "latched";
export type KeyboardSectionMode = "keyboard" | "synthesizer";
/** On-screen key arrangement; `auto` follows the active Windows keyboard layout. */
export type OnscreenLayout = "auto" | "QWERTY" | "QWERTZ" | "AZERTY" | "Greek";
/** Outline/label palette for transparent mini-mode keyboard. */
export type TransparentKeyColor = "white" | "dark-gray" | "silver";

export type PointerInputKind = "touch" | "mouse";

export interface LayoutSnapshot {
  sectionStack?: SectionStackState;
  inputRowRightRatio?: number;
  windowHeightRatio?: number;
}

export interface AppSettings {
  colorProfile: ColorProfileId;
  opacity: number;
  uiLanguage: string;
  typingLanguage: string;
  /** Preferred on-screen key layout (independent of Windows typing language when not auto). */
  onscreenLayout?: OnscreenLayout;
  mouseVisible: boolean;
  mousePanelMode: MousePanelMode;
  mousePanelSide: MousePanelSide;
  keyboardFontSize?: number;
  /** Docked stack + float-layer layout (preferred). */
  sectionStack?: SectionStackState;
  /** Legacy free-float layouts; migrated into sectionStack on load. */
  sectionLayouts?: LegacySectionLayouts;
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
  /** When false, hides the toolbar mic / dictation control. */
  dictationVisible: boolean;
  /** Free Groq API key for cloud dictation when Windows speech packs are unavailable (e.g. Greek). */
  groqApiKey?: string;
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
  /** Piano window width in octaves (C-to-C). Combined with synthesizerStartOctave. */
  synthesizerOctaveCount?: SynthOctaveCount;
  /** Lowest C of the piano window (e.g. 2 → C2–C(2+count)). */
  synthesizerStartOctave?: number;
  /** Fraction of input-row width used by the mouse / numpad panel (0–1). */
  inputRowRightRatio?: number;
  /** When true, hides section toolbars and suggestions for more keyboard/trackpad area. */
  inputAreaCompact: boolean;
  /** When false, hides drag lock, precision, and scroll buttons on the trackpad. */
  mouseBottomRowVisible: boolean;
  /**
   * Doubles header heights and header chrome buttons, and turns non-button
   * header areas into vertical resize grips (sections + OS window).
   */
  largeHeaders: boolean;
  /**
   * Optional override for OS window height as a fraction of the monitor region.
   * Combined with visibility-based content ratio via Math.max.
   */
  windowHeightRatio?: number;
  /** null = auto, true = force on, false = force off */
  miniModeOverride?: boolean | null;
  miniModeTransparent?: boolean;
  /** Outline/label color when transparent keyboard is active. */
  transparentKeyColor?: TransparentKeyColor;
  touchLayout?: LayoutSnapshot;
  mouseLayout?: LayoutSnapshot;
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
  /** Set by backend when this entry overlaps another monitor ≥90% (Windows mirror duplicate). */
  is_mirror_duplicate?: boolean;
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
  colorProfile: "dark-grey",
  ...COLOR_PROFILE_PRESETS["dark-grey"],
  opacity: 0.95,
  uiLanguage: "en",
  typingLanguage: "en",
  onscreenLayout: "auto",
  mouseVisible: true,
  mousePanelMode: "mouse",
  mousePanelSide: "right",
  keyboardFontSize: 18,
  backgroundImageOpacity: 0.35,
  mouseSpeed: "medium",
  precisionMode: false,
  predictionEnabled: false,
  quickActionsVisible: false,
  phrasesVisible: false,
  suggestionsVisible: false,
  dictationVisible: false,
  groqApiKey: "",
  emergencyVisible: false,
  accessibilityMonitorId: 0,
  collapsed: false,
  headTrackingEnabled: false,
  mouseAutoHide: false,
  fnKeyMode: "one-shot",
  keyboardSectionMode: "keyboard",
  keyboardModeToggleVisible: false,
  synthesizerVolume: 70,
  synthesizerMuted: false,
  synthesizerOctaveCount: 2,
  synthesizerStartOctave: 3,
  inputRowRightRatio: 0.28,
  inputAreaCompact: false,
  mouseBottomRowVisible: true,
  largeHeaders: false,
  transparentKeyColor: "white",
};
