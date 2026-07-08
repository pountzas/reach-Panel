import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

export function SuggestionsBar() {
  const { suggestions, settings, applySuggestion, updateSettings } = useAppStore();
  const { t } = useTranslation();

  if (!settings.predictionEnabled && suggestions.length === 0) {
    return (
      <div className="flex min-w-0 items-center gap-2 overflow-hidden py-1 pl-1">
        <span className="shrink-0 text-xs text-slate-500">{t("predictionsOff")}</span>
        <button
          type="button"
          className="shrink-0 text-xs text-blue-600"
          onClick={() => updateSettings({ predictionEnabled: true })}
        >
          {t("enable")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pl-1">
      <span className="shrink-0 text-xs font-medium text-slate-500">{t("suggest")}</span>
      {suggestions.map((word) => (
        <button
          key={word}
          type="button"
          className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
          onClick={() => applySuggestion(word)}
        >
          {word}
        </button>
      ))}
      <button
        type="button"
        className="shrink-0 text-xs text-slate-500"
        onClick={() => updateSettings({ predictionEnabled: false })}
      >
        {t("turnOff")}
      </button>
    </div>
  );
}
