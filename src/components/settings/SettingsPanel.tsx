import { type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { isV1FeatureHidden } from "../../lib/v1HiddenFeatures";
import { SettingsSection } from "./SettingsSection";
import { CompanionSection } from "./CompanionSection";
import { AboutSection } from "./AboutSection";
import { ModesSection } from "./ModesSection";
import { ProfileSection } from "./ProfileSection";
import { AccessibilityMonitorSection } from "./AccessibilityMonitorSection";
import { TaskbarSection } from "./TaskbarSection";
import { AppearanceSection } from "./AppearanceSection";
import { VisibleSectionsSection } from "./VisibleSectionsSection";
import { KeyboardSettingsSection } from "./KeyboardSettingsSection";
import { MouseSettingsSection } from "./MouseSettingsSection";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { ToolsMaintenanceSection } from "./ToolsMaintenanceSection";
import { CloseIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { ToolWindowHeader } from "../common/ToolWindowHeader";

export function SettingsPanel() {
  const { settings, setShowSettings } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      setShowSettings: s.setShowSettings,
    })),
  );
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);
  const headerBg = settings.headerBgColor ?? "#1e293b";
  const headerText = settings.headerTextColor ?? "#ffffff";
  const secondaryButtonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ backgroundColor: settings.appBgColor ?? "#f1f5f9" }}>
      <ToolWindowHeader
        className="flex shrink-0 items-center justify-between px-5 py-3"
        style={{ backgroundColor: headerBg, color: headerText }}
        title={t("settings")}
        actions={
          <IconActionButton
            label={t("close")}
            onClick={() => {
              setShowSettings(false);
            }}
            className="rounded bg-white/20 hover:bg-white/30"
            tooltipPlacement="below">
            <CloseIcon />
          </IconActionButton>
        }
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <ModesSection surface={surface} />
        <ProfileSection
          surface={surface}
          headerBg={headerBg}
          headerText={headerText}
        />
        <AccessibilityMonitorSection surface={surface} />
        <TaskbarSection surface={surface} />
        <AppearanceSection
          surface={surface}
          secondaryButtonStyle={secondaryButtonStyle}
        />
        <VisibleSectionsSection surface={surface} />
        <KeyboardSettingsSection
          surface={surface}
          secondaryButtonStyle={secondaryButtonStyle}
        />
        {!isV1FeatureHidden("mouse") && (
          <MouseSettingsSection surface={surface} />
        )}
        <GeneralSettingsSection surface={surface} />
        <SettingsSection
          title={t("settingsCompanion")}
          description={t("companionDescription")}
          surface={surface}>
          <CompanionSection surface={surface} />
        </SettingsSection>
        <ToolsMaintenanceSection
          surface={surface}
          secondaryButtonStyle={secondaryButtonStyle}
        />
        <SettingsSection title={t("settingsAbout")} surface={surface}>
          <AboutSection surface={surface} />
        </SettingsSection>
      </div>
    </div>
  );
}
