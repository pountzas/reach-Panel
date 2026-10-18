import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";

export function AccessibilityMonitorSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const { settings, updateSettings, monitors } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      monitors: s.monitors,
    })),
  );

  if (!settings) return null;

  return (
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
    </SettingsSection>
  );
}
