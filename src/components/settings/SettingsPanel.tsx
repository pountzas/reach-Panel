import { QuickActionEditor } from "../quick-actions/QuickActionEditor";

import { useAppStore } from "../../stores/appStore";

import { useTranslation } from "../../hooks/useTranslation";



export function SettingsPanel() {

  const {

    settings,

    updateSettings,

    profiles,

    activeProfileId,

    setActiveProfile,

    monitors,

    setShowSettings,

    setShowMacroBuilder,

    setShowHeadTrackingWizard,

    resetSettingsToDefaults,

  } = useAppStore();

  const { t } = useTranslation();



  if (!settings) return null;



  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">

        <div className="mb-4 flex items-center justify-between">

          <h2 className="text-lg font-bold">{t("settings")}</h2>

          <button type="button" onClick={() => setShowSettings(false)}>

            {t("close")}

          </button>

        </div>



        <section className="mb-4">

          <h3 className="mb-2 font-semibold">{t("profile")}</h3>

          <select

            className="w-full rounded border px-2 py-2"

            value={activeProfileId ?? ""}

            onChange={(e) => setActiveProfile(e.target.value)}

          >

            {profiles.map((p) => (

              <option key={p.id} value={p.id}>

                {p.name}

              </option>

            ))}

          </select>

        </section>



        <section className="mb-4">

          <h3 className="mb-2 font-semibold">{t("accessibilityScreen")}</h3>

          <select

            className="w-full rounded border px-2 py-2"

            value={settings.accessibilityMonitorId}

            onChange={(e) =>

              updateSettings({ accessibilityMonitorId: Number(e.target.value) })

            }

          >

            {monitors.map((m) => (

              <option key={m.id} value={m.id}>

                {m.name} ({m.width}x{m.height})

                {m.is_primary ? ` [${t("primary")}]` : ""}

              </option>

            ))}

          </select>

        </section>



        <section className="mb-4">

          <h3 className="mb-2 font-semibold">{t("mouse")}</h3>

          <label className="flex items-center gap-2 text-sm">

            <input

              type="checkbox"

              checked={settings.mouseVisible}

              onChange={(e) =>

                updateSettings({ mouseVisible: e.target.checked })

              }

            />

            {t("showMouseSection")}

          </label>

          {settings.mouseVisible && (

            <label className="mt-2 block text-sm">

              {t("position")}

              <select

                className="mt-1 w-full rounded border px-2 py-1"

                value={settings.mouseSide}

                onChange={(e) =>

                  updateSettings({

                    mouseSide: e.target.value as "right" | "left" | "floating",

                  })

                }

              >

                <option value="right">{t("mouseRight")}</option>

                <option value="left">{t("mouseLeft")}</option>

                <option value="floating">{t("mouseFloating")}</option>

              </select>

            </label>

          )}

        </section>



        <section className="mb-4">

          <h3 className="mb-2 font-semibold">{t("quickActions")}</h3>

          <label className="flex items-center gap-2 text-sm">

            <input

              type="checkbox"

              checked={settings.quickActionsVisible}

              onChange={(e) =>

                updateSettings({ quickActionsVisible: e.target.checked })

              }

            />

            {t("showQuickActionsBar")}

          </label>

        </section>



        <section className="mb-4">

          <h3 className="mb-2 font-semibold">{t("phrasesAndSuggestions")}</h3>

          <label className="flex items-center gap-2 text-sm">

            <input

              type="checkbox"

              checked={settings.phrasesVisible}

              onChange={(e) =>

                updateSettings({ phrasesVisible: e.target.checked })

              }

            />

            {t("showPhrasesSection")}

          </label>

          <label className="mt-2 flex items-center gap-2 text-sm">

            <input

              type="checkbox"

              checked={settings.suggestionsVisible}

              onChange={(e) =>

                updateSettings({ suggestionsVisible: e.target.checked })

              }

            />

            {t("showSuggestionsBar")}

          </label>

        </section>



        <section className="mb-4 grid grid-cols-2 gap-3">

          <label className="text-sm">

            {t("keySize")}

            <input

              type="range"

              min={36}

              max={80}

              value={settings.keyboardKeySize}

              onChange={(e) =>

                updateSettings({ keyboardKeySize: Number(e.target.value) })

              }

              className="w-full"

            />

          </label>

          <label className="text-sm">

            {t("spacing")}

            <input

              type="range"

              min={0}

              max={30}

              value={settings.keyboardSpacing}

              onChange={(e) =>

                updateSettings({ keyboardSpacing: Number(e.target.value) })

              }

              className="w-full"

            />

          </label>

          <label className="text-sm">

            {t("opacity")}

            <input

              type="range"

              min={0.5}

              max={1}

              step={0.05}

              value={settings.opacity}

              onChange={(e) =>

                updateSettings({ opacity: Number(e.target.value) })

              }

              className="w-full"

            />

          </label>

          <label className="text-sm">

            {t("appTypingLanguage")}

            <select

              className="w-full rounded border px-2 py-1"

              value={settings.language}

              onChange={(e) => updateSettings({ language: e.target.value })}

            >

              <option value="en">{t("languageEnglish")}</option>

              <option value="el">{t("languageGreek")}</option>

            </select>

          </label>

        </section>



        <section className="mb-4">

          <QuickActionEditor />

        </section>



        <section className="mb-4">

          <button

            type="button"

            className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"

            onClick={() => void resetSettingsToDefaults()}

          >

            {t("resetSettings")}

          </button>

          <p className="mt-1 text-xs text-slate-500">{t("resetSettingsHint")}</p>

        </section>



        <section className="flex flex-wrap gap-2">

          <button

            type="button"

            className="rounded-lg bg-slate-100 px-3 py-2 text-sm"

            onClick={() => {

              setShowSettings(false);

              setShowMacroBuilder(true);

            }}

          >

            {t("macroBuilder")}

          </button>

          <button

            type="button"

            className="rounded-lg bg-slate-100 px-3 py-2 text-sm"

            onClick={() => {

              setShowSettings(false);

              setShowHeadTrackingWizard(true);

            }}

          >

            {t("headTracking")}

          </button>

        </section>

      </div>

    </div>

  );

}

