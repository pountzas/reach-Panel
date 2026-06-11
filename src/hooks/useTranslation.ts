import { useAppStore } from "../stores/appStore";
import { t, TranslationKey } from "../i18n";

export function useTranslation() {
  const language = useAppStore((s) => s.settings.language);
  return {
    t: (key: TranslationKey) => t(language, key),
    language,
  };
}
