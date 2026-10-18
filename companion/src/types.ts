/** Matches host serde (snake_case on DB models; camelCase on snapshot envelope keys). */

export type ProfileInfo = {
  id: string;
  name: string;
  settings_json: string;
  created_at: string;
};

export type PredictionEntry = {
  word: string;
  language: string;
  frequency: number;
};

export type InputMethod = {
  hkl: number;
  langTag: string;
  displayName: string;
  layoutName: string;
  klid: string;
};

export type TabletSettings = {
  typingLanguage?: string;
  predictionEnabled?: boolean;
  mouseVisible?: boolean;
  [key: string]: unknown;
};

export type ProfileSnapshot = {
  profile: ProfileInfo;
  settings: TabletSettings;
};
