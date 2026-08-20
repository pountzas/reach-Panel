import { CompactViewIcon, ExpandedViewIcon } from "../common/SectionIcons";
import { HeaderIconToggleGroup } from "../common/HeaderIconToggleGroup";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

export function InputAreaViewButtons() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const compact = settings.inputAreaCompact;

  return (
    <HeaderIconToggleGroup
      className="ml-1"
      value={compact ? "compact" : "normal"}
      onChange={(id) => updateSettings({ inputAreaCompact: id === "compact" })}
      options={[
        {
          id: "normal",
          label: t("inputAreaNormal"),
          icon: (iconClass) => <CompactViewIcon className={iconClass} />,
        },
        {
          id: "compact",
          label: t("inputAreaCompact"),
          icon: (iconClass) => <ExpandedViewIcon className={iconClass} />,
        },
      ]}
    />
  );
}
