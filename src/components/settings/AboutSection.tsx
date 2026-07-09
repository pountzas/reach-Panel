import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { APP_INFO, openExternalLink } from "../../lib/appInfo";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { getCurrentAppVersion } from "../../lib/updater";
import type { TranslationKey } from "../../i18n";

const LINK_BUTTONS: { labelKey: TranslationKey; url: string }[] = [
  { labelKey: "aboutGitHub", url: APP_INFO.links.github },
  { labelKey: "aboutSource", url: APP_INFO.links.githubRepo },
  { labelKey: "aboutTwitter", url: APP_INFO.links.twitter },
  { labelKey: "aboutLinkedIn", url: APP_INFO.links.linkedin },
  { labelKey: "aboutWebsite", url: APP_INFO.links.website },
  { labelKey: "aboutEmail", url: APP_INFO.links.email },
];

interface AboutSectionProps {
  surface: SurfaceColors;
}

export function AboutSection({ surface }: AboutSectionProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getCurrentAppVersion().then(setVersion);
  }, []);

  const secondaryButtonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold" style={{ color: surface.panelText }}>
          {t("appTitle")}
        </p>
        <p className="mt-1 text-xs" style={{ color: surface.panelMutedText }}>
          {t("aboutDescription")}
        </p>
      </div>

      <p className="text-sm" style={{ color: surface.panelText }}>
        {t("aboutVersion")}:{" "}
        <span className="font-medium">{version ?? "…"}</span>
      </p>

      <p className="text-sm" style={{ color: surface.panelText }}>
        {t("aboutCreatedBy")}{" "}
        <span className="font-medium">{APP_INFO.creator}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {LINK_BUTTONS.map(({ labelKey, url }) => (
          <button
            key={labelKey}
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            style={secondaryButtonStyle}
            onClick={() => openExternalLink(url)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
