import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";

export function SuggestionsBar() {
  const { suggestions, settings, applySuggestion } = useAppStore();
  const surface = getSurfaceColors(settings.appBgColor);
  const bgColor = settings.keyboardKeyColor ?? "#f3f4f6";
  const textColor = settings.keyTextColor ?? "#374151";

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 max-w-full items-center justify-center gap-2.5 overflow-x-auto py-1">
      {suggestions.map((word) => (
        <button
          key={word}
          type="button"
          className={`${PRESSABLE_BUTTON_CLASS} shrink-0 rounded-full px-4 py-1.5 text-base`}
          style={{
            backgroundColor: bgColor,
            color: textColor,
            borderColor: surface.panelBorder,
          }}
          onClick={() => applySuggestion(word)}
        >
          {word}
        </button>
      ))}
    </div>
  );
}
