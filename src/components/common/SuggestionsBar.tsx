import { useAppStore } from "../../stores/appStore";

import { useTranslation } from "../../hooks/useTranslation";



export function SuggestionsBar() {

  const { suggestions, settings, applySuggestion, updateSettings } = useAppStore();

  const { t } = useTranslation();



  if (!settings.predictionEnabled && suggestions.length === 0) {

    return (

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2">

        <span className="text-xs text-slate-500">{t("predictionsOff")}</span>

        <button

          type="button"

          className="text-xs text-blue-600"

          onClick={() => updateSettings({ predictionEnabled: true })}

        >

          {t("enable")}

        </button>

      </div>

    );

  }



  return (

    <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">

      <span className="text-xs font-medium text-slate-500">{t("suggest")}</span>

      {suggestions.map((word) => (

        <button

          key={word}

          type="button"

          className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800"

          onClick={() => applySuggestion(word)}

        >

          {word}

        </button>

      ))}

      <button

        type="button"

        className="ml-auto text-xs text-slate-500"

        onClick={() => updateSettings({ predictionEnabled: false })}

      >

        {t("turnOff")}

      </button>

    </div>

  );

}

