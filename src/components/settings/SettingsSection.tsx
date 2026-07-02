import type { ReactNode } from "react";
import type { SurfaceColors } from "../../lib/colorProfiles";

interface SettingsSectionProps {
  title: string;
  description?: string;
  surface: SurfaceColors;
  children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  surface,
  children,
}: SettingsSectionProps) {
  return (
    <section
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{
        backgroundColor: surface.panelBg,
        borderColor: surface.panelBorder,
      }}
    >
      <div
        className="border-b px-4 py-2.5"
        style={{
          backgroundColor: surface.panelHeaderBg,
          borderColor: surface.panelBorder,
        }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: surface.panelText }}
        >
          {title}
        </h3>
        {description && (
          <p
            className="mt-0.5 text-xs"
            style={{ color: surface.panelMutedText }}
          >
            {description}
          </p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
