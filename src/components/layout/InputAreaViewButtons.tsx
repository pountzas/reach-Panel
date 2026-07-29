import { CompactViewIcon, ExpandedViewIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

export function InputAreaViewButtons() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const compact = settings.inputAreaCompact;
  const largeHeaders = settings.largeHeaders;
  const iconSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-3.5 w-3.5";

  return (
    <div className="section-no-drag ml-1 flex shrink-0 items-center gap-0.5">
      <IconActionButton
        label={t("inputAreaNormal")}
        onClick={() => updateSettings({ inputAreaCompact: false })}
        className={!compact ? "bg-black/10" : ""}
        size={iconSize}
        tooltipPlacement="below"
      >
        <CompactViewIcon className={iconClass} />
      </IconActionButton>
      <IconActionButton
        label={t("inputAreaCompact")}
        onClick={() => updateSettings({ inputAreaCompact: true })}
        className={compact ? "bg-black/10" : ""}
        size={iconSize}
        tooltipPlacement="below"
      >
        <ExpandedViewIcon className={iconClass} />
      </IconActionButton>
    </div>
  );
}
