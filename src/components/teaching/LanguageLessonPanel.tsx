import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";

export function LanguageLessonPanel() {
  const settings = useAppStore((s) => s.settings);
  const { t } = useTranslation();
  const surface = getSurfaceColors(settings.appBgColor);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2 p-3"
      style={{ color: surface.panelText }}
    >
      <h2 className="text-base font-semibold">{t("languageLessonTitle")}</h2>
      <p className="text-sm" style={{ color: surface.panelMutedText }}>
        {t("comingSoon")}
      </p>
    </div>
  );
}
