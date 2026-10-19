import { CollapseIcon, ExpandIcon, FocusIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

/** Centered Minimize/Restore + Focus for Teaching Language/Math keyboard header. */
export function TeachingKeyboardHeaderControls() {
  const { t } = useTranslation();
  const minimized = useAppStore((s) => s.teachingKeyboardMinimized);
  const autoFocus = useAppStore((s) => s.teachingKeyboardAutoFocus);
  const toggleMinimized = useAppStore((s) => s.toggleTeachingKeyboardMinimized);
  const toggleAutoFocus = useAppStore((s) => s.toggleTeachingKeyboardAutoFocus);
  const iconSize = "sm" as const;
  const iconClass = "h-3.5 w-3.5";

  return (
    <div className="section-no-drag flex items-center justify-center gap-0.5">
      <IconActionButton
        label={minimized ? t("expand") : t("minimizeSection")}
        onClick={() => { toggleMinimized(); }}
        size={iconSize}
        tooltipPlacement="below"
      >
        {minimized ? (
          <ExpandIcon className={iconClass} />
        ) : (
          <CollapseIcon className={iconClass} />
        )}
      </IconActionButton>
      <IconActionButton
        label={t("teachingKeyboardFocus")}
        onClick={() => { toggleAutoFocus(); }}
        pressed={autoFocus}
        size={iconSize}
        tooltipPlacement="below"
      >
        <FocusIcon className={iconClass} />
      </IconActionButton>
    </div>
  );
}
