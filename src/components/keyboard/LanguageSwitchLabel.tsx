import { Flag } from "svg-flags";
import { nextLanguage } from "../../lib/keyboardLayouts";

const LANGUAGE_FLAG: Record<string, string> = {
  en: "gb",
  el: "gr",
};

interface LanguageSwitchLabelProps {
  currentLanguage: string;
  fontSize: number;
}

export function LanguageSwitchLabel({
  currentLanguage,
  fontSize,
}: LanguageSwitchLabelProps) {
  const target = nextLanguage(currentLanguage);
  const flagCode = LANGUAGE_FLAG[target] ?? "gb";

  return (
    <span className="flex items-center justify-center gap-1">
      <Flag
        country={flagCode}
        width={Math.max(20, fontSize + 4)}
        alt={target === "el" ? "Greek" : "English"}
        showBorder
        borderWidth={1}
      />
      <span className="sr-only">{target === "el" ? "Greek" : "English"}</span>
    </span>
  );
}
