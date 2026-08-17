import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { CompanionSection } from "../settings/CompanionSection";
import { useTranslation } from "../../hooks/useTranslation";

/**
 * Host chrome while Companion mode is active: connection status and pairing
 * controls (reuses Settings CompanionSection). Not hosted inside MiniModeShell.
 */
export function CompanionModeShell() {
  const settings = useAppStore((s) => s.settings);
  const surface = getSurfaceColors(settings.appBgColor);
  const { t } = useTranslation();

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: settings.appBgColor ?? "#f1f5f9",
      }}
    >
      <header
        className="flex shrink-0 items-center px-4 py-3"
        style={{
          backgroundColor: settings.headerBgColor ?? "#1e293b",
          color: settings.headerTextColor ?? "#ffffff",
        }}
      >
        <h1 className="text-lg font-semibold">{t("settingsCompanion")}</h1>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        style={{ color: surface.panelText }}
      >
        <CompanionSection surface={surface} />
      </div>
    </div>
  );
}
