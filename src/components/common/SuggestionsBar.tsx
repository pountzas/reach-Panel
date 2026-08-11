import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { isTransparentUiActive, transparentOutlineStyle } from "../../lib/miniMode";

export function SuggestionsBar() {
  const suggestions = useAppStore((s) => s.suggestions);
  const settings = useAppStore((s) => s.settings);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
  const applySuggestion = useAppStore((s) => s.applySuggestion);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const { t } = useTranslation();
  const transparent = isTransparentUiActive(settings, miniModeActive);
  const labelStyle = transparent
    ? { color: "#f8fafc", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }
    : undefined;
  const chipStyle = transparent
    ? transparentOutlineStyle({ color: "#f8fafc" })
    : undefined;

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
          className={`shrink-0 text-xs ${transparent ? "rounded-full px-2 py-0.5 font-medium" : "text-blue-600"}`}
          style={chipStyle}
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
              : "shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
          }
          style={chipStyle}
          onClick={() => applySuggestion(word)}
        >
          {word}
        </button>
      ))}
      <button
        type="button"
        className={`shrink-0 text-xs ${transparent ? "rounded-full px-2 py-0.5 font-medium" : "text-slate-500"}`}
        style={transparent ? chipStyle : undefined}
        onClick={() => updateSettings({ predictionEnabled: false })}
      >
        {t("turnOff")}
      </button>
    </div>
  );
}
