import { useState } from "react";
import { QuickActionEditor } from "../quick-actions/QuickActionEditor";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import {
  COLOR_PROFILE_IDS,
  getColorProfileColors,
  type ColorProfileId,
} from "../../lib/colorProfiles";
import type { FnKeyMode } from "../../lib/types";
import type { TranslationKey } from "../../i18n";

const COLOR_PROFILE_LABEL_KEYS: Record<ColorProfileId, TranslationKey> = {
  "light-grey": "colorProfileLightGrey",
  "dark-grey": "colorProfileDarkGrey",
  custom: "colorProfileCustom",
};

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
        />
      </div>
    </label>
  );
}

export function SettingsPanel() {
  const {
    settings,
    updateSettings,
    profileFiles,
    activeProfileFile,
    setProfileFile,
    createProfileFile,
    pickBackgroundImage,
    monitors,
    setShowSettings,
    setShowMacroBuilder,
    setShowHeadTrackingWizard,
    resetSettingsToDefaults,
    checkForUpdates,
    updateCheckStatus,
  } = useAppStore();
  const { t } = useTranslation();
  const [newProfileName, setNewProfileName] = useState("");

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
            value={activeProfileFile ?? ""}
            onChange={(e) => setProfileFile(e.target.value)}
          >
            {profileFiles.map((p) => (
              <option key={p.filename} value={p.filename}>
                {p.name} ({p.filename})
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
              placeholder={t("newProfileFileName")}
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg bg-slate-800 px-3 py-1 text-sm text-white"
              onClick={() => {
                if (!newProfileName.trim()) return;
                void createProfileFile(newProfileName.trim(), newProfileName.trim());
                setNewProfileName("");
              }}
            >
              {t("createProfile")}
            </button>
          </div>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-semibold">{t("accessibilityScreen")}</h3>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
            {monitors.map((m) => {
              const label = `${m.name} (${m.width}x${m.height})${m.is_primary ? ` [${t("primary")}]` : ""}`;
              return (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="accessibilityMonitor"
                      className="mt-1 shrink-0"
                      checked={settings.accessibilityMonitorId === m.id}
                      onChange={() => updateSettings({ accessibilityMonitorId: m.id })}
                    />
                    <span className="min-w-0 break-all text-sm leading-snug">{label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-semibold">{t("appearance")}</h3>
          <fieldset className="mb-3">
            <legend className="mb-1 text-sm font-medium">{t("colorProfile")}</legend>
            <div className="flex flex-wrap gap-2">
              {COLOR_PROFILE_IDS.map((id) => (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1 text-sm ${
                    settings.colorProfile === id ? "border-slate-800 bg-slate-100" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="colorProfile"
                    checked={settings.colorProfile === id}
                    onChange={() =>
                      updateSettings({
                        colorProfile: id,
                        ...getColorProfileColors(id),
                      })
                    }
                  />
                  {t(COLOR_PROFILE_LABEL_KEYS[id])}
                </label>
              ))}
            </div>
          </fieldset>
          {settings.colorProfile === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label={t("appBackgroundColor")}
                value={settings.appBgColor ?? "#f1f5f9"}
                onChange={(v) =>
                  updateSettings({ appBgColor: v, colorProfile: "custom" })
                }
              />
              <ColorField
                label={t("headerColor")}
                value={settings.headerBgColor ?? "#1e293b"}
                onChange={(v) =>
                  updateSettings({ headerBgColor: v, colorProfile: "custom" })
                }
              />
              <ColorField
                label={t("headerTextColor")}
                value={settings.headerTextColor ?? "#ffffff"}
                onChange={(v) =>
                  updateSettings({ headerTextColor: v, colorProfile: "custom" })
                }
              />
              <ColorField
                label={t("keyboardBackgroundColor")}
                value={settings.keyboardBgColor ?? "#e8edf2"}
                onChange={(v) =>
                  updateSettings({ keyboardBgColor: v, colorProfile: "custom" })
                }
              />
              <ColorField
                label={t("keyColor")}
                value={settings.keyboardKeyColor ?? "#ffffff"}
                onChange={(v) =>
                  updateSettings({ keyboardKeyColor: v, colorProfile: "custom" })
                }
              />
              <ColorField
                label={t("keyTextColor")}
                value={settings.keyTextColor ?? "#1e293b"}
                onChange={(v) =>
                  updateSettings({ keyTextColor: v, colorProfile: "custom" })
                }
              />
              <ColorField
                label={t("mousePanelColor")}
                value={settings.mousePanelBgColor ?? "#f8fafc"}
                onChange={(v) =>
                  updateSettings({ mousePanelBgColor: v, colorProfile: "custom" })
                }
              />
            </div>
          )}
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1 text-sm"
                onClick={() => void pickBackgroundImage()}
              >
                {t("chooseBackgroundImage")}
              </button>
              {settings.backgroundImagePath && (
                <button
                  type="button"
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700"
                  onClick={() => updateSettings({ backgroundImagePath: undefined })}
                >
                  {t("removeBackgroundImage")}
                </button>
              )}
            </div>
            {settings.backgroundImagePath && (
              <label className="block text-sm">
                {t("backgroundImageOpacity")}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.backgroundImageOpacity ?? 0.35}
                  onChange={(e) =>
                    updateSettings({ backgroundImageOpacity: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
            )}
          </div>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-semibold">{t("keyboard")}</h3>
          <label className="block text-sm">
            {t("fnKeyMode")}
            <select
              value={settings.fnKeyMode}
              onChange={(e) =>
                updateSettings({ fnKeyMode: e.target.value as FnKeyMode })
              }
              className="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="one-shot">{t("fnKeyModeOneShot")}</option>
              <option value="latched">{t("fnKeyModeLatched")}</option>
            </select>
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.keyboardModeToggleVisible}
              onChange={(e) =>
                updateSettings({ keyboardModeToggleVisible: e.target.checked })
              }
            />
            {t("showKeyboardModeToggle")}
          </label>
          {!settings.keyboardModeToggleVisible && (
            <label className="mt-2 block text-sm">
              {t("keyboardSectionMode")}
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                value={settings.keyboardSectionMode}
                onChange={(e) =>
                  updateSettings({
                    keyboardSectionMode: e.target.value as "keyboard" | "synthesizer",
                  })
                }
              >
                <option value="keyboard">{t("keyboard")}</option>
                <option value="synthesizer">{t("synthesizer")}</option>
              </select>
            </label>
          )}
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-semibold">{t("mouse")}</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.mouseVisible}
              onChange={(e) => updateSettings({ mouseVisible: e.target.checked })}
            />
            {t("showMouseSection")}
          </label>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-semibold">{t("quickActions")}</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.quickActionsVisible}
              onChange={(e) => updateSettings({ quickActionsVisible: e.target.checked })}
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
              onChange={(e) => updateSettings({ phrasesVisible: e.target.checked })}
            />
            {t("showPhrasesSection")}
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.suggestionsVisible}
              onChange={(e) => updateSettings({ suggestionsVisible: e.target.checked })}
            />
            {t("showSuggestionsBar")}
          </label>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3">
          <label className="text-sm">
            {t("opacity")}
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={settings.opacity}
              onChange={(e) => updateSettings({ opacity: Number(e.target.value) })}
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

        <section className="mb-4">
          <h3 className="mb-2 font-semibold">{t("checkForUpdates")}</h3>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm disabled:opacity-50"
            disabled={updateCheckStatus === "checking"}
            onClick={() => void checkForUpdates()}
          >
            {updateCheckStatus === "checking" ? t("updatePreparing") : t("checkForUpdates")}
          </button>
          {updateCheckStatus === "upToDate" && (
            <p className="mt-1 text-xs text-green-700">{t("updateUpToDate")}</p>
          )}
          {updateCheckStatus === "error" && (
            <p className="mt-1 text-xs text-red-700">{t("updateCheckFailed")}</p>
          )}
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
