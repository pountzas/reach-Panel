import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

const FAB_SIZE = 56;

export function CollapsedFab() {
  const { settings, toggleCollapsed, isAnimatingWindow } = useAppStore();
  const { t } = useTranslation();

  const bgColor = settings.headerBgColor ?? "#1e293b";
  const textColor = settings.headerTextColor ?? "#ffffff";

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: "transparent" }}
    >
      <button
        type="button"
        className="flex items-center justify-center rounded-full font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          backgroundColor: bgColor,
          color: textColor,
          fontSize: 22,
        }}
        onClick={toggleCollapsed}
        disabled={isAnimatingWindow}
        aria-label={t("expand")}
      >
        R
      </button>
    </div>
  );
}
