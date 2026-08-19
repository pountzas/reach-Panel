import { useAppStore } from "../../stores/appStore";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { isTransparentUiActive, transparentKeyPalette, transparentOutlineStyle } from "../../lib/miniMode";

const SUGGESTION_CHIP_BG = "#dbeafe";
const SUGGESTION_CHIP_TEXT = "#1e3a8a";

export function SuggestionsBar() {
  const suggestions = useAppStore((s) => s.suggestions);
  const settings = useAppStore((s) => s.settings);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
  const applySuggestion = useAppStore((s) => s.applySuggestion);
  const transparent = isTransparentUiActive(settings, miniModeActive);
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

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      className="flex min-w-0 items-center justify-center gap-2 overflow-x-auto"
      style={transparent ? { backgroundColor: "transparent" } : undefined}
    >
      {suggestions.map((word) => (
        <button
          key={word}
          type="button"
          className={
            transparent
              ? "shrink-0 rounded-full px-3 py-1 text-sm font-medium"
              : `${PRESSABLE_BUTTON_CLASS} shrink-0 rounded-full px-3 py-1 text-sm font-medium`
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
