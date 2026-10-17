import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ToggleRow } from "./settingsControls";

export function MouseSettingsSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
    })),
  );

  if (!settings) return null;

  return (
    <SettingsSection title={t("mouse")} surface={surface}>
      <ToggleRow
        label={t("showMouseBottomRow")}
        checked={settings.mouseBottomRowVisible}
        onChange={(checked) => updateSettings({ mouseBottomRowVisible: checked })}
        surface={surface}
      />
    </SettingsSection>
  );
}
