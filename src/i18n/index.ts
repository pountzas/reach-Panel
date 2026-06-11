import { el } from "./el";
import { en } from "./en";

export type TranslationKey = keyof typeof en;

const translations = { en, el } as const;

export function t(language: string, key: TranslationKey): string {
  const dict = translations[language as keyof typeof translations] ?? en;
  return dict[key] ?? en[key];
}
