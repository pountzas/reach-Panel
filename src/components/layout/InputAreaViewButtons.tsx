import { useShallow } from "zustand/react/shallow";
import { CompactViewIcon, ExpandedViewIcon } from "../common/SectionIcons";
import { HeaderIconToggleGroup } from "../common/HeaderIconToggleGroup";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

export function InputAreaViewButtons() {
  const { compact, updateSettings } = useAppStore(
    useShallow((s) => ({
      compact: s.settings.inputAreaCompact,
      updateSettings: s.updateSettings,
    })),
  );
  const { t } = useTranslation();

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
