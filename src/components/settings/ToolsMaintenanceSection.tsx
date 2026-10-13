import { type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { notify } from "../../lib/notify";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { handleWipeProfile } from "./settingsPanelUtils";

type ToolsMaintenanceSectionProps = {
  surface: SurfaceColors;
  secondaryButtonStyle: CSSProperties;
};

export function ToolsMaintenanceSection({
  surface,
  secondaryButtonStyle,
}: ToolsMaintenanceSectionProps) {
  const { t } = useTranslation();
  const { resetSettingsToDefaults, wipeActiveProfile, checkForUpdates, updateCheckStatus } =
    useAppStore(
      useShallow((s) => ({
        resetSettingsToDefaults: s.resetSettingsToDefaults,
        wipeActiveProfile: s.wipeActiveProfile,
        checkForUpdates: s.checkForUpdates,
        updateCheckStatus: s.updateCheckStatus,
      })),
    );

  return (
    <SettingsSection title={t("settingsToolsMaintenance")} surface={surface}>
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
                const detail = useAppStore.getState().updateCheckError;
                notify.error(
                  detail ? `${t("updateCheckFailed")} ${detail}` : t("updateCheckFailed"),
                );
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
        onClick={() => void handleWipeProfile(wipeActiveProfile, t)}
      >
        {t("wipeProfile")}
      </button>
      <p className="mt-1 text-xs" style={{ color: surface.panelMutedText }}>
        {t("wipeProfileHint")}
      </p>
    </SettingsSection>
  );
}
