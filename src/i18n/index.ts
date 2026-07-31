import { de } from "./de";
import { el } from "./el";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { pt } from "./pt";

export type TranslationKey = keyof typeof en;

const translations = { en, el, de, fr, it, es, pt } as const;

export function t(language: string, key: TranslationKey): string {
  const dict = translations[language as keyof typeof translations] ?? en;
  return dict[key] ?? en[key];
}
