import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { PRESSABLE_BUTTON_CLASS } from "../../lib/buttonClasses";
import { isTransparentUiActive, transparentKeyPalette, transparentOutlineStyle } from "../../lib/miniMode";

export function SuggestionsBar() {
  const suggestions = useAppStore((s) => s.suggestions);
  const settings = useAppStore((s) => s.settings);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
  const applySuggestion = useAppStore((s) => s.applySuggestion);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const { t } = useTranslation();
  const transparent = isTransparentUiActive(settings, miniModeActive);
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);
  const surface = getSurfaceColors(settings.appBgColor);
  const chipBgColor = settings.keyboardKeyColor ?? "#f3f4f6";
  const chipTextColor = settings.keyTextColor ?? "#374151";
  const labelStyle = transparent
    ? { color: transparentPalette.text, textShadow: "0 1px 2px rgba(0,0,0,0.8)" }
    : undefined;
  const transparentChipStyle = transparent
    ? transparentOutlineStyle({
        color: transparentPalette.text,
        outlineColor: settings.transparentKeyColor,
      })
    : undefined;
  const themedChipStyle = transparent
    ? undefined
    : {
        backgroundColor: chipBgColor,
        color: chipTextColor,
        borderColor: surface.panelBorder,
      };

  if (!settings.predictionEnabled && suggestions.length === 0) {
    return (
      <div
        className="flex min-w-0 items-center gap-2 overflow-hidden py-1 pl-1"
        style={transparent ? { backgroundColor: "transparent" } : undefined}
      >
        <span
          className={`shrink-0 text-xs ${transparent ? "" : "text-slate-500"}`}
          style={labelStyle}
        >
          {t("predictionsOff")}
        </span>
        <button
          type="button"
          className={
            transparent
              ? "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              : `${PRESSABLE_BUTTON_CLASS} shrink-0 rounded-full px-2 py-0.5 text-xs font-medium`
          }
          style={transparent ? transparentChipStyle : themedChipStyle}
          onClick={() => updateSettings({ predictionEnabled: true })}
        >
          {t("enable")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pl-1"
      style={transparent ? { backgroundColor: "transparent" } : undefined}
    >
      <span
        className={`shrink-0 text-xs font-medium ${transparent ? "" : "text-slate-500"}`}
        style={labelStyle}
      >
        {t("suggest")}
      </span>
      {suggestions.map((word) => (
        <button
          key={word}
          type="button"
          className={
            transparent
              ? "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
              : `${PRESSABLE_BUTTON_CLASS} shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium`
          }
          style={transparent ? transparentChipStyle : themedChipStyle}
          onClick={() => applySuggestion(word)}
        >
          {word}
        </button>
      ))}
      <button
        type="button"
        className={
          transparent
            ? "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            : "shrink-0 text-xs text-slate-500"
        }
        style={transparent ? transparentChipStyle : undefined}
        onClick={() => updateSettings({ predictionEnabled: false })}
      >
        {t("turnOff")}
      </button>
    </div>
  );
}
