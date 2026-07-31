import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { QuickActionEditor } from "../quick-actions/QuickActionEditor";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import {
  COLOR_PROFILE_IDS,
  getColorProfileColors,
  getSurfaceColors,
  type ColorProfileId,
  type SurfaceColors,
} from "../../lib/colorProfiles";
import type { FnKeyMode, OnscreenLayout } from "../../lib/types";
import type { TranslationKey } from "../../i18n";
import { notify } from "../../lib/notify";
import { ONSCREEN_LAYOUT_OPTIONS } from "../../lib/keyboardLayouts";
import { SettingsSection } from "./SettingsSection";
import { AboutSection } from "./AboutSection";
import { CloseIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";

const COLOR_PROFILE_LABEL_KEYS: Record<ColorProfileId, TranslationKey> = {
  "light-grey": "colorProfileLightGrey",
  "dark-grey": "colorProfileDarkGrey",
  custom: "colorProfileCustom",
};

function fieldStyle(surface: SurfaceColors): CSSProperties {
  return {
    backgroundColor: surface.insetBg,
    borderColor: surface.insetBorder,
    color: surface.panelText,
  };
}

function ColorField({
  label,
  value,
  onChange,
  surface,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  surface: SurfaceColors;
}) {
  return (
    <label className="text-sm" style={{ color: surface.panelText }}>
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border"
          style={{ borderColor: surface.insetBorder }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
          style={fieldStyle(surface)}
        />
      </div>
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  surface,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  surface: SurfaceColors;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: surface.insetBg }}
    >
      <span className="text-sm" style={{ color: surface.panelText }}>
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function ThemedSelect({
  value,
  onChange,
  surface,
  children,
  className = "mt-1 w-full rounded border px-2 py-1.5 text-sm",
}: {
  value: string;
  onChange: (value: string) => void;
  surface: SurfaceColors;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      className={className}
      style={fieldStyle(surface)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
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
    deleteProfileFile,
    saveActiveProfile,
    pickBackgroundImage,
    monitors,
    setShowSettings,
    setShowMacroBuilder,
    setShowHeadTrackingWizard,
    resetSettingsToDefaults,
    wipeActiveProfile,
    checkForUpdates,
    updateCheckStatus,
    stopDictation,
    inputMethods,
    loadInputMethods,
    selectTypingInputMethod,
    physicalKeyState,
  } = useAppStore();
  const { t } = useTranslation();
  const [newProfileName, setNewProfileName] = useState("");

  useEffect(() => {
    void loadInputMethods();
  }, [loadInputMethods]);

  if (!settings) return null;

  const activeTypingValue = String(
    inputMethods.find((m) => m.hkl === physicalKeyState.systemHkl)?.hkl ??
      inputMethods.find((m) => m.langTag === settings.typingLanguage)?.hkl ??
      "",
  );

  const surface = getSurfaceColors(settings.appBgColor);
  const headerBg = settings.headerBgColor ?? "#1e293b";
  const headerText = settings.headerTextColor ?? "#ffffff";
  const secondaryButtonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  const handleSaveProfile = async () => {
    try {
      await saveActiveProfile();
      notify.success(t("profileSaved"));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDeleteProfile = async () => {
    if (!activeProfileFile) return;
    if (!window.confirm(t("deleteProfileConfirm"))) return;
    try {
      await deleteProfileFile(activeProfileFile);
      notify.success(t("profileDeleted"));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleWipeProfile = async () => {
    if (!window.confirm(t("wipeProfileConfirm"))) return;
    try {
      await wipeActiveProfile();
      notify.success(t("profileWiped"));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: settings.appBgColor ?? "#f1f5f9" }}
    >
      <div
        className="flex shrink-0 items-center justify-between px-5 py-3"
        style={{ backgroundColor: headerBg, color: headerText }}
      >
        <h2 className="text-lg font-bold">{t("settings")}</h2>
        <IconActionButton
          label={t("close")}
          onClick={() => setShowSettings(false)}
          className="rounded bg-white/20 hover:bg-white/30"
          tooltipPlacement="below"
        >
          <CloseIcon />
        </IconActionButton>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <SettingsSection title={t("profile")} surface={surface}>
            <ThemedSelect
              value={activeProfileFile ?? ""}
              onChange={(v) => setProfileFile(v)}
              surface={surface}
              className="w-full rounded border px-2 py-2 text-sm"
            >
              {profileFiles.map((p) => (
                <option key={p.filename} value={p.filename}>
                  {p.name} ({p.filename})
                </option>
              ))}
            </ThemedSelect>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm"
                style={{ backgroundColor: headerBg, color: headerText }}
                onClick={() => void handleSaveProfile()}
              >
                {t("saveProfile")}
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700"
                style={{ backgroundColor: surface.insetBg }}
                onClick={() => void handleDeleteProfile()}
                disabled={!activeProfileFile}
              >
                {t("deleteProfile")}
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
                style={fieldStyle(surface)}
                placeholder={t("newProfileFileName")}
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm"
                style={{ backgroundColor: headerBg, color: headerText }}
                onClick={() => {
                  if (!newProfileName.trim()) return;
                  void createProfileFile(newProfileName.trim(), newProfileName.trim());
                  setNewProfileName("");
                }}
              >
                {t("createProfile")}
              </button>
            </div>
          </SettingsSection>

          <SettingsSection title={t("accessibilityScreen")} surface={surface}>
            <ul
              className="max-h-48 space-y-1 overflow-y-auto rounded border p-2"
              style={{
                backgroundColor: surface.insetBg,
                borderColor: surface.insetBorder,
              }}
            >
              {monitors.map((m) => {
                const label = `${m.name} (${m.width}x${m.height})${m.is_primary ? ` [${t("primary")}]` : ""}`;
                return (
                  <li key={m.id}>
                    <label
                      className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5"
                      style={{ color: surface.panelText }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = surface.panelButtonBg;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
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
            <div className="mt-3">
              <ToggleRow
                label={t("largeHeaders")}
                checked={settings.largeHeaders}
                onChange={(checked) => updateSettings({ largeHeaders: checked })}
                surface={surface}
              />
              <p
                className="mt-1 px-1 text-xs"
                style={{ color: surface.panelMutedText }}
              >
                {t("largeHeadersHint")}
              </p>
            </div>
          </SettingsSection>

          <SettingsSection title={t("appearance")} surface={surface}>
            <fieldset className="mb-4">
              <legend
                className="mb-2 text-sm font-medium"
                style={{ color: surface.panelText }}
              >
                {t("colorProfile")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {COLOR_PROFILE_IDS.map((id) => {
                  const selected = settings.colorProfile === id;
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                      style={{
                        borderColor: selected ? surface.panelBorder : surface.insetBorder,
                        backgroundColor: selected ? surface.panelHeaderBg : surface.insetBg,
                        color: surface.panelText,
                      }}
                    >
                      <input
                        type="radio"
                        name="colorProfile"
                        checked={selected}
                        onChange={() =>
                          updateSettings({
                            colorProfile: id,
                            ...getColorProfileColors(id),
                          })
                        }
                      />
                      {t(COLOR_PROFILE_LABEL_KEYS[id])}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {settings.colorProfile === "custom" && (
              <div className="mb-4 grid grid-cols-2 gap-3">
                <ColorField
                  label={t("appBackgroundColor")}
                  value={settings.appBgColor ?? "#f1f5f9"}
                  onChange={(v) => updateSettings({ appBgColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
                <ColorField
                  label={t("headerColor")}
                  value={settings.headerBgColor ?? "#1e293b"}
                  onChange={(v) => updateSettings({ headerBgColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
                <ColorField
                  label={t("headerTextColor")}
                  value={settings.headerTextColor ?? "#ffffff"}
                  onChange={(v) => updateSettings({ headerTextColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
                <ColorField
                  label={t("keyboardBackgroundColor")}
                  value={settings.keyboardBgColor ?? "#e8edf2"}
                  onChange={(v) => updateSettings({ keyboardBgColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
                <ColorField
                  label={t("keyColor")}
                  value={settings.keyboardKeyColor ?? "#ffffff"}
                  onChange={(v) => updateSettings({ keyboardKeyColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
                <ColorField
                  label={t("keyTextColor")}
                  value={settings.keyTextColor ?? "#1e293b"}
                  onChange={(v) => updateSettings({ keyTextColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
                <ColorField
                  label={t("mousePanelColor")}
                  value={settings.mousePanelBgColor ?? "#f8fafc"}
                  onChange={(v) => updateSettings({ mousePanelBgColor: v, colorProfile: "custom" })}
                  surface={surface}
                />
              </div>
            )}

            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  style={secondaryButtonStyle}
                  onClick={() => void pickBackgroundImage()}
                >
                  {t("chooseBackgroundImage")}
                </button>
                {settings.backgroundImagePath && (
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700"
                    style={{ backgroundColor: surface.insetBg }}
                    onClick={() => updateSettings({ backgroundImagePath: undefined })}
                  >
                    {t("removeBackgroundImage")}
                  </button>
                )}
              </div>
              {settings.backgroundImagePath && (
                <label className="block text-sm" style={{ color: surface.panelText }}>
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
                    className="mt-1 w-full"
                  />
                </label>
              )}
            </div>

            <label className="block text-sm" style={{ color: surface.panelText }}>
              {t("opacity")}
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={settings.opacity}
                onChange={(e) => updateSettings({ opacity: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </label>
          </SettingsSection>

          <SettingsSection title={t("settingsVisibleSections")} surface={surface}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ToggleRow
                label={t("showMouseSection")}
                checked={settings.mouseVisible}
                onChange={(checked) => updateSettings({ mouseVisible: checked })}
                surface={surface}
              />
              <ToggleRow
                label={t("showQuickActionsBar")}
                checked={settings.quickActionsVisible}
                onChange={(checked) => updateSettings({ quickActionsVisible: checked })}
                surface={surface}
              />
              <ToggleRow
                label={t("showPhrasesSection")}
                checked={settings.phrasesVisible}
                onChange={(checked) => updateSettings({ phrasesVisible: checked })}
                surface={surface}
              />
              <ToggleRow
                label={t("showSuggestionsBar")}
                checked={settings.suggestionsVisible}
                onChange={(checked) => updateSettings({ suggestionsVisible: checked })}
                surface={surface}
              />
            </div>
          </SettingsSection>

          <SettingsSection title={t("keyboard")} surface={surface}>
            <label className="block text-sm" style={{ color: surface.panelText }}>
              {t("fnKeyMode")}
              <ThemedSelect
                value={settings.fnKeyMode}
                onChange={(v) => updateSettings({ fnKeyMode: v as FnKeyMode })}
                surface={surface}
              >
                <option value="one-shot">{t("fnKeyModeOneShot")}</option>
                <option value="latched">{t("fnKeyModeLatched")}</option>
              </ThemedSelect>
            </label>
            <div className="mt-3">
              <ToggleRow
                label={t("showKeyboardModeToggle")}
                checked={settings.keyboardModeToggleVisible}
                onChange={(checked) => updateSettings({ keyboardModeToggleVisible: checked })}
                surface={surface}
              />
            </div>
            <div className="mt-3">
              <ToggleRow
                label={t("showDictationControl")}
                checked={settings.dictationVisible !== false}
                onChange={(checked) => {
                  if (!checked) {
                    void stopDictation();
                  }
                  void updateSettings({ dictationVisible: checked });
                }}
                surface={surface}
              />
            </div>
            <label className="mt-3 block text-sm" style={{ color: surface.panelText }}>
              {t("groqApiKeyLabel")}
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm outline-none"
                style={{
                  backgroundColor: surface.panelButtonBg,
                  borderColor: surface.panelBorder,
                  color: surface.panelText,
                }}
                value={settings.groqApiKey ?? ""}
                onChange={(e) => void updateSettings({ groqApiKey: e.target.value })}
                placeholder="gsk_…"
              />
              <span className="mt-1 block text-xs opacity-80">{t("groqApiKeyHint")}</span>
            </label>
            {!settings.keyboardModeToggleVisible && (
              <label className="mt-3 block text-sm" style={{ color: surface.panelText }}>
                {t("keyboardSectionMode")}
                <ThemedSelect
                  value={settings.keyboardSectionMode}
                  onChange={(v) =>
                    updateSettings({
                      keyboardSectionMode: v as "keyboard" | "synthesizer",
                    })
                  }
                  surface={surface}
                >
                  <option value="keyboard">{t("keyboard")}</option>
                  <option value="synthesizer">{t("synthesizer")}</option>
                </ThemedSelect>
              </label>
            )}
          </SettingsSection>

          <SettingsSection title={t("mouse")} surface={surface}>
            <ToggleRow
              label={t("showMouseBottomRow")}
              checked={settings.mouseBottomRowVisible}
              onChange={(checked) => updateSettings({ mouseBottomRowVisible: checked })}
              surface={surface}
            />
          </SettingsSection>

          <SettingsSection title={t("quickActions")} surface={surface}>
            <QuickActionEditor surface={surface} />
          </SettingsSection>

          <SettingsSection title={t("settingsGeneral")} surface={surface}>
            <label className="mb-3 block text-sm" style={{ color: surface.panelText }}>
              {t("appLanguage")}
              <ThemedSelect
                value={settings.uiLanguage}
                onChange={(v) => updateSettings({ uiLanguage: v })}
                surface={surface}
              >
                <option value="en">{t("languageEnglish")}</option>
                <option value="el">{t("languageGreek")}</option>
                <option value="de">{t("languageGerman")}</option>
                <option value="fr">{t("languageFrench")}</option>
                <option value="it">{t("languageItalian")}</option>
                <option value="es">{t("languageSpanish")}</option>
                <option value="pt">{t("languagePortuguese")}</option>
              </ThemedSelect>
              <span className="mt-1 block text-xs" style={{ color: surface.panelMutedText }}>
                {t("appLanguageHint")}
              </span>
            </label>
            <label className="mb-3 block text-sm" style={{ color: surface.panelText }}>
              {t("typingLanguage")}
              <ThemedSelect
                value={activeTypingValue}
                onChange={(v) => {
                  const method = inputMethods.find((m) => String(m.hkl) === v);
                  if (method) {
                    void selectTypingInputMethod(method);
                  }
                }}
                surface={surface}
              >
                {inputMethods.length === 0 ? (
                  <option value="">{settings.typingLanguage.toUpperCase()}</option>
                ) : (
                  inputMethods.map((m) => (
                    <option key={`${m.hkl}-${m.klid}`} value={String(m.hkl)}>
                      {m.displayName} ({m.layoutName})
                    </option>
                  ))
                )}
              </ThemedSelect>
              <span className="mt-1 block text-xs" style={{ color: surface.panelMutedText }}>
                {t("typingLanguageHint")}
              </span>
            </label>
            <label className="block text-sm" style={{ color: surface.panelText }}>
              {t("onscreenLayout")}
              <ThemedSelect
                value={settings.onscreenLayout ?? "auto"}
                onChange={(v) =>
                  void updateSettings({ onscreenLayout: v as OnscreenLayout })
                }
                surface={surface}
              >
                {ONSCREEN_LAYOUT_OPTIONS.map((layout) => (
                  <option key={layout} value={layout}>
                    {layout === "auto" ? t("onscreenLayoutAuto") : layout}
                  </option>
                ))}
              </ThemedSelect>
              <span className="mt-1 block text-xs" style={{ color: surface.panelMutedText }}>
                {t("onscreenLayoutHint")}
              </span>
            </label>
          </SettingsSection>

          <SettingsSection title={t("settingsToolsMaintenance")} surface={surface}>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                style={secondaryButtonStyle}
                onClick={() => {
                  setShowMacroBuilder(true);
                }}
              >
                {t("macroBuilder")}
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                style={secondaryButtonStyle}
                onClick={() => {
                  setShowHeadTrackingWizard(true);
                }}
              >
                {t("headTracking")}
              </button>
            </div>

            <div className="mb-4">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                style={secondaryButtonStyle}
                disabled={updateCheckStatus === "checking"}
                onClick={() => {
                  void (async () => {
                    await checkForUpdates();
                    const status = useAppStore.getState().updateCheckStatus;
                    if (status === "upToDate") {
                      notify.success(t("updateUpToDate"));
                    } else if (status === "error") {
                      notify.error(t("updateCheckFailed"));
                    }
                  })();
                }}
              >
                {updateCheckStatus === "checking" ? t("updatePreparing") : t("checkForUpdates")}
              </button>
            </div>

            <button
              type="button"
              className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
              style={{ backgroundColor: surface.insetBg }}
              onClick={() => void resetSettingsToDefaults()}
            >
              {t("resetUi")}
            </button>
            <p className="mt-1 text-xs" style={{ color: surface.panelMutedText }}>
              {t("resetUiHint")}
            </p>
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
              style={{ backgroundColor: surface.insetBg }}
              onClick={() => void handleWipeProfile()}
            >
              {t("wipeProfile")}
            </button>
            <p className="mt-1 text-xs" style={{ color: surface.panelMutedText }}>
              {t("wipeProfileHint")}
            </p>
          </SettingsSection>

          <SettingsSection title={t("settingsAbout")} surface={surface}>
            <AboutSection surface={surface} />
          </SettingsSection>
        </div>
    </div>
  );
}
