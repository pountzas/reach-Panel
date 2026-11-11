import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { FnKeyMode } from "../../lib/types";
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
    </SettingsSection>
  );
}
