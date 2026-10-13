import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { TaskbarPosition } from "../../lib/types";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { ThemedSelect } from "./settingsControls";
import { applyTaskbarPosition } from "./settingsPanelUtils";

export function TaskbarSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
    })),
  );

  useEffect((): void => {
    if (!settings) return;
    const monitorId = settings.accessibilityMonitorId;
    void invoke<TaskbarPosition | null>("cmd_get_taskbar_position", { monitorId }).then(
      (current) => {
        if (current && current !== (settings.taskbarPositionPreference ?? "bottom")) {
          updateSettings({ taskbarPositionPreference: current });
        }
      },
    );
  }, [settings, updateSettings]);

  if (!settings) return null;

  const taskbarPosition = settings.taskbarPositionPreference === "top" ? "top" : "bottom";

  return (
    <SettingsSection title={t("taskbarPosition")} surface={surface}>
      <p className="mb-2 px-1 text-xs" style={{ color: surface.panelMutedText }}>
        {t("taskbarPositionHint")}
      </p>
      <label className="block text-sm" style={{ color: surface.panelText }}>
        {t("taskbarPosition")}
        <ThemedSelect
          value={taskbarPosition}
          onChange={(v) =>
            void applyTaskbarPosition(
              v as TaskbarPosition,
              settings.taskbarPositionPreference,
              settings.accessibilityMonitorId,
              updateSettings,
              t,
            )
          }
          surface={surface}
        >
          <option value="bottom">{t("taskbarPositionBottom")}</option>
          <option value="top">{t("taskbarPositionTop")}</option>
        </ThemedSelect>
      </label>
    </SettingsSection>
  );
}
