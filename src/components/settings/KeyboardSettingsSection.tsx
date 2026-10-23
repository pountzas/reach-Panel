import { type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { FnKeyMode } from "../../lib/types";
import { GROQ_API_KEYS_URL, openExternalLink } from "../../lib/appInfo";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ThemedSelect } from "./settingsControls";

type KeyboardSettingsSectionProps = {
  surface: SurfaceColors;
  secondaryButtonStyle: CSSProperties;
};

export function KeyboardSettingsSection({
  surface,
  secondaryButtonStyle,
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
          style={secondaryButtonStyle}
          onClick={() => {
            openExternalLink(GROQ_API_KEYS_URL);
          }}>
          {t("groqApiKeyLink")}
        </button>
      </div>
    </SettingsSection>
  );
}
