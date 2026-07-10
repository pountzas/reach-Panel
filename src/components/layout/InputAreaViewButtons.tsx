import { CompactViewIcon, ExpandedViewIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

export function InputAreaViewButtons() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const compact = settings.inputAreaCompact;

  return (
    <div className="section-no-drag ml-1 flex shrink-0 items-center gap-0.5">
      <IconActionButton
        label={t("inputAreaNormal")}
        onClick={() => updateSettings({ inputAreaCompact: false })}
        className={!compact ? "bg-black/10" : ""}
      >
        <CompactViewIcon className="h-3.5 w-3.5" />
      </IconActionButton>
      <IconActionButton
        label={t("inputAreaCompact")}
        onClick={() => updateSettings({ inputAreaCompact: true })}
        className={compact ? "bg-black/10" : ""}
      >
        <ExpandedViewIcon className="h-3.5 w-3.5" />
      </IconActionButton>
    </div>
  );
}
