/** Matches host serde (snake_case on DB models; camelCase on snapshot envelope keys). */

export type Phrase = {
  id: string;
  profile_id: string;
  category_id: string;
  text: string;
  action: string;
  is_favorite: boolean;
  is_emergency: boolean;
};

export type PhraseCategory = {
  id: string;
  profile_id: string;
  name: string;
  sort_order: number;
};

export type QuickAction = {
  id: string;
  profile_id: string;
  label: string;
  target: string;
  action_type: string;
  category: string;
  sort_order: number;
};

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

export type TabletSettings = {
  typingLanguage?: string;
  predictionEnabled?: boolean;
  phrasesVisible?: boolean;
  quickActionsVisible?: boolean;
  mouseVisible?: boolean;
  [key: string]: unknown;
};

export type ProfileSnapshot = {
  profile: ProfileInfo;
  phrases: Phrase[];
  phraseCategories: PhraseCategory[];
  quickActions: QuickAction[];
  settings: TabletSettings;
};
