import { Flag } from "svg-flags";
import { flagCodeForLanguage, languageDisplayCode } from "../../lib/keyboardLayouts";

interface LanguageSwitchLabelProps {
  currentLanguage: string;
  fontSize: number;
}

export function LanguageSwitchLabel({
  currentLanguage,
  fontSize,
}: LanguageSwitchLabelProps) {
  const flagCode = flagCodeForLanguage(currentLanguage);
  const code = languageDisplayCode(currentLanguage);

  return (
    <span className="flex items-center justify-center gap-1">
      <Flag
        country={flagCode}
        width={Math.max(18, fontSize + 2)}
        alt={code}
        showBorder
        borderWidth={1}
      />
      <span className="text-[0.85em] font-semibold leading-none">{code}</span>
      <span className="sr-only">{code}</span>
    </span>
  );
}
