import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { FnKeyMode, PcMicSendMode } from "../../lib/types";
import {
  DEFAULT_PC_MIC_CUSTOM_KEYS,
  DEFAULT_PC_MIC_SEND_MODE,
} from "../../lib/pcMicSend";
import { MicShortcutRecorder } from "./MicShortcutRecorder";
import { GROQ_API_KEYS_URL, openExternalLink } from "../../lib/appInfo";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ThemedSelect } from "./settingsControls";

type KeyboardSettingsSectionProps = {
  surface: SurfaceColors;
};

export function KeyboardSettingsSection({
  surface,
}: KeyboardSettingsSectionProps) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
    })),
  );
  return (
    <SettingsSection title={t("keyboard")} surface={surface}>
      <label className="block text-sm" style={{ color: surface.panelText }}>
        {t("fnKeyMode")}
        <ThemedSelect
          value={settings.fnKeyMode}
          onChange={(v) => updateSettings({ fnKeyMode: v as FnKeyMode })}
          surface={surface}>
          <option value="one-shot">{t("fnKeyModeOneShot")}</option>
          <option value="latched">{t("fnKeyModeLatched")}</option>
        </ThemedSelect>
      </label>
      <label
        className="mt-3 block text-sm"
        style={{ color: surface.panelText }}>
        {t("pcMicSendMode")}
        <ThemedSelect
          value={settings.pcMicSendMode ?? DEFAULT_PC_MIC_SEND_MODE}
          onChange={(v) => {
            const mode = v as PcMicSendMode;
            if (mode === "custom") {
              void updateSettings({
                pcMicSendMode: mode,
                pcMicCustomKeys: settings.pcMicCustomKeys ?? [
                  ...DEFAULT_PC_MIC_CUSTOM_KEYS,
                ],
              });
              return;
            }
            void updateSettings({ pcMicSendMode: mode });
          }}
          surface={surface}>
          <option value="winH">{t("pcMicSendWinH")}</option>
          <option value="rightAlt">{t("pcMicSendRightAlt")}</option>
          <option value="custom">{t("pcMicSendCustom")}</option>
        </ThemedSelect>
        <span className="mt-1 block text-xs opacity-80">
          {t("pcMicSendHint")}
        </span>
      </label>
      {(settings.pcMicSendMode ?? DEFAULT_PC_MIC_SEND_MODE) === "custom" ? (
        <MicShortcutRecorder
          value={settings.pcMicCustomKeys ?? [...DEFAULT_PC_MIC_CUSTOM_KEYS]}
          onChange={(keys) => void updateSettings({ pcMicCustomKeys: keys })}
          surface={surface}
        />
      ) : null}
      <div className="mt-3">
        <label
          className="block text-sm"
          htmlFor="settings-groq-api-key"
          style={{ color: surface.panelText }}>
          {t("groqApiKeyLabel")}
          <input
            id="settings-groq-api-key"
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
            onChange={(e) =>
              void updateSettings({ groqApiKey: e.target.value })
            }
            placeholder="gsk_…"
          />
          <span className="mt-1 block text-xs opacity-80">
            {t("groqApiKeyHint")}
          </span>
        </label>
        <button
          type="button"
          className="mt-2 rounded-lg border px-3 py-2 text-sm"
          style={{
            backgroundColor: surface.panelButtonBg,
            borderColor: surface.panelBorder,
            color: surface.panelText,
          }}
          onClick={() => {
            openExternalLink(GROQ_API_KEYS_URL);
          }}>
          {t("groqApiKeyLink")}
        </button>
      </div>
    </SettingsSection>
  );
}
