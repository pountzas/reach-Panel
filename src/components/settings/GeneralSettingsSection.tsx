import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import {
  getCachedAutostartEnabled,
  reconcileAutostartOnLoad,
  setAutostartEnabled,
} from "../../lib/autostart";
import { notify } from "../../lib/notify";
import { resolveOnscreenLayout } from "../../lib/keyboardLayouts";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ThemedSelect, ToggleRow } from "./settingsControls";

export function GeneralSettingsSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const [launchAtSignIn, setLaunchAtSignIn] = useState<boolean>(() =>
    getCachedAutostartEnabled(),
  );
  const [launchAtSignInBusy, setLaunchAtSignInBusy] = useState(false);

  const {
    settings,
    updateSettings,
    inputMethods,
    loadInputMethods,
    selectTypingInputMethod,
    physicalKeyState,
    keyboardLayout,
  } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      inputMethods: s.inputMethods,
      loadInputMethods: s.loadInputMethods,
      selectTypingInputMethod: s.selectTypingInputMethod,
      physicalKeyState: s.physicalKeyState,
      keyboardLayout: s.keyboardLayout,
    })),
  );

  useEffect((): void => {
    void loadInputMethods();
  }, [loadInputMethods]);

  useEffect((): (() => void) => {
    let cancelled = false;
    void reconcileAutostartOnLoad()
      .then((on) => {
        if (!cancelled) setLaunchAtSignIn(on);
      })
      .catch(() => {
        /* boot path already logs; keep cached UI */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) return null;

  const activeTypingValue = String(
    inputMethods.find((m) => m.hkl === physicalKeyState.systemHkl)?.hkl ??
      inputMethods.find((m) => m.langTag === settings.typingLanguage)?.hkl ??
      "",
  );

  return (
    <SettingsSection title={t("settingsGeneral")} surface={surface}>
      <div className="mb-3">
        <ToggleRow
          label={t("launchAtWindowsSignIn")}
          checked={launchAtSignIn}
          disabled={launchAtSignInBusy}
          onChange={(checked) => {
            setLaunchAtSignInBusy(true);
            setLaunchAtSignIn(checked);
            void setAutostartEnabled(checked)
              .then((on) => setLaunchAtSignIn(on))
              .catch(() => {
                setLaunchAtSignIn(getCachedAutostartEnabled());
                notify.error(t("launchAtWindowsSignInError"));
              })
              .finally(() => setLaunchAtSignInBusy(false));
          }}
          surface={surface}
        />
        <span className="mt-1 block px-3 text-xs" style={{ color: surface.panelMutedText }}>
          {t("launchAtWindowsSignInHint")}
        </span>
      </div>
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
      <div className="block text-sm" style={{ color: surface.panelText }}>
        <span className="block">{t("onscreenLayout")}</span>
        <span
          className="mt-1 block rounded border px-3 py-2 text-sm"
          style={{
            backgroundColor: surface.insetBg,
            borderColor: surface.insetBorder,
            color: surface.panelText,
          }}
        >
          {resolveOnscreenLayout(keyboardLayout, settings.typingLanguage)}
        </span>
        <span className="mt-1 block text-xs" style={{ color: surface.panelMutedText }}>
          {t("onscreenLayoutHint")}
        </span>
      </div>
    </SettingsSection>
  );
}
