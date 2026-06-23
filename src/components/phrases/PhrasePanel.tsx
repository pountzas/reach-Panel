import { invoke } from "@tauri-apps/api/core";

import { useAppStore } from "../../stores/appStore";

import { useTranslation } from "../../hooks/useTranslation";



export function PhrasePanel() {

  const { phrases, settings, updateSettings } = useAppStore();

  const { t } = useTranslation();



  const regular = phrases.filter((p) => !p.is_emergency);

  const emergency = phrases.filter((p) => p.is_emergency);

  const favorites = regular.filter((p) => p.is_favorite);

  const others = regular.filter((p) => !p.is_favorite);



  const usePhrase = async (text: string, action: string) => {

    await invoke("cmd_use_phrase", { text, action, language: settings.language });

  };



  return (

    <div className="flex h-full flex-col gap-2 overflow-auto rounded-xl border border-slate-200 bg-white p-2">

      <div className="flex items-center justify-between">

        <span className="text-sm font-semibold">{t("phrases")}</span>

        <label className="flex items-center gap-1 text-xs text-slate-600">

          <input

            type="checkbox"

            checked={settings.emergencyVisible}

            onChange={(e) => updateSettings({ emergencyVisible: e.target.checked })}

          />

          {t("showEmergency")}

        </label>

      </div>



      {favorites.length > 0 && (

        <div className="flex flex-wrap gap-1">

          {favorites.map((p) => (

            <button

              key={p.id}

              type="button"

              className="rounded-lg bg-yellow-100 px-3 py-2 text-sm font-medium"

              onClick={() => usePhrase(p.text, p.action)}

            >

              {p.text}

            </button>

          ))}

        </div>

      )}



      <div className="flex flex-wrap gap-1">

        {others.map((p) => (

          <button

            key={p.id}

            type="button"

            className="rounded-lg bg-slate-100 px-3 py-2 text-sm"

            onClick={() => usePhrase(p.text, p.action)}

          >

            {p.text}

          </button>

        ))}

      </div>



      {settings.emergencyVisible && emergency.length > 0 && (

        <div className="mt-1 rounded-lg border-2 border-red-300 bg-red-50 p-2">

          <div className="mb-1 text-xs font-bold text-red-700">{t("emergency")}</div>

          <div className="flex flex-wrap gap-1">

            {emergency.map((p) => (

              <button

                key={p.id}

                type="button"

                className="rounded-lg bg-red-200 px-4 py-3 text-sm font-bold text-red-900"

                onClick={() => usePhrase(p.text, p.action)}

              >

                {p.text}

              </button>

            ))}

          </div>

        </div>

      )}

    </div>

  );

}

