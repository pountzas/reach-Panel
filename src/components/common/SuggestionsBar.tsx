import { FaRegLightbulb } from "react-icons/fa";
import { useAppStore } from "../../stores/appStore";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { isTransparentUiActive, transparentKeyPalette, transparentOutlineStyle } from "../../lib/focusMode";
import { useTranslation } from "../../hooks/useTranslation";

const SUGGESTION_CHIP_BG = "#dbeafe";
const SUGGESTION_CHIP_TEXT = "#1e3a8a";

export function SuggestionsBar({
  suggestions: suggestionsProp,
}: {
  suggestions?: string[];
} = {}) {
  const { t } = useTranslation();
  const storeSuggestions = useAppStore((s) => s.suggestions);
  const suggestions = suggestionsProp ?? storeSuggestions;
  const settings = useAppStore((s) => s.settings);
  const focusModeActive = useAppStore((s) => s.focusModeActive);
  const applySuggestion = useAppStore((s) => s.applySuggestion);
  const transparent = isTransparentUiActive(settings, focusModeActive);
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);
  const transparentChipStyle = transparent
    ? transparentOutlineStyle({
        color: transparentPalette.text,
        outlineColor: settings.transparentKeyColor,
      })
    : undefined;
  const themedChipStyle = transparent
    ? undefined
    : {
        backgroundColor: SUGGESTION_CHIP_BG,
        color: SUGGESTION_CHIP_TEXT,
        borderColor: "#93c5fd",
      };

  return (
    <div
      className="flex min-w-0 items-center justify-center gap-1.5 overflow-x-auto py-0"
      style={transparent ? { backgroundColor: "transparent" } : undefined}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{ color: transparent ? transparentPalette.text : SUGGESTION_CHIP_TEXT }}
        aria-label={t("showSuggestionsBar")}
        title={t("showSuggestionsBar")}
      >
        <FaRegLightbulb className="h-4 w-4" aria-hidden />
      </span>
      {suggestions.map((word) => (
        <button
          key={word}
          type="button"
          className={
            transparent
              ? "shrink-0 rounded-full px-3 py-0.5 text-sm font-medium"
              : `${PRESSABLE_BUTTON_CLASS} shrink-0 rounded-full px-3 py-0.5 text-sm font-medium`
          }
          style={transparent ? transparentChipStyle : themedChipStyle}
          onClick={() => applySuggestion(word)}
        >
          {word}
        </button>
      ))}
    </div>
  );
}
