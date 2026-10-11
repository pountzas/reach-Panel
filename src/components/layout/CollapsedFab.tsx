import { MicrophoneIcon, SettingsIcon } from "../common/SectionIcons";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import {
  COLLAPSED_FAB_GAP,
  COLLAPSED_FAB_PAD,
  COLLAPSED_FAB_SIZE,
  collapsedFabContentMinSize,
  type CollapsedFabCount,
} from "../../lib/focusMode";

export interface CollapsedFabProps {
  /** Show Settings (gear) above Expand (Focus mode). */
  showSettings?: boolean;
  /** Show Mic FAB above Settings (Mic mode). */
  showDictation?: boolean;
  onSettings?: () => void;
  /** When set, Expand uses this instead of toggleCollapsed (Focus mode manual expand). */
  onExpand?: () => void;
}

export function CollapsedFab({
  showSettings = false,
  showDictation = false,
  onSettings,
  onExpand,
}: CollapsedFabProps) {
  const {
    settings,
    toggleCollapsed,
    isAnimatingWindow,
    dictationState,
    sttCapability,
    externalInputFocused,
    toggleDictation,
  } = useAppStore();
  const { t } = useTranslation();

  const bgColor = settings.headerBgColor ?? "#1e293b";
  const textColor = settings.headerTextColor ?? "#ffffff";

  const listening =
    dictationState === "listening" || dictationState === "processing";
  const micEnabled =
    listening ||
    ((sttCapability?.canDictate ?? false) && externalInputFocused);

  const fabCount = ((): CollapsedFabCount => {
    const n = (showSettings ? 1 : 0) + (showDictation ? 1 : 0) + 1;
    if (n === 1 || n === 2 || n === 3) return n;
    return 2;
  })();
  const contentMin = collapsedFabContentMinSize(fabCount);

  const handleExpand = () => {
    if (onExpand) {
      onExpand();
      return;
    }
    void toggleCollapsed();
  };

  const micAriaLabel = listening
    ? t("dictationStop")
    : micEnabled
      ? t("dictationStart")
      : t("micModeSelectInput");

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-visible"
      style={{
        background: "transparent",
        gap: COLLAPSED_FAB_GAP,
        padding: COLLAPSED_FAB_PAD,
        minWidth: contentMin.minWidth,
        minHeight: contentMin.minHeight,
      }}
    >
      {showDictation && (
        <button
          type="button"
          className="flex items-center justify-center rounded-full shadow-lg transition-[transform,background-color,color] duration-200 hover:scale-[1.03] active:scale-95 disabled:opacity-50"
          style={{
            width: COLLAPSED_FAB_SIZE,
            height: COLLAPSED_FAB_SIZE,
            backgroundColor: listening ? "#dc2626" : bgColor,
            // Light blue only when armed (input focused + can dictate), not while recording.
            color: listening
              ? "#ffffff"
              : micEnabled
                ? "#501fffff"
                : textColor,
          }}
          disabled={!micEnabled}
          aria-disabled={!micEnabled}
          onClick={() => void toggleDictation()}
          aria-label={micAriaLabel}
        >
          <MicrophoneIcon className="h-6 w-6 transition-colors duration-200" />
        </button>
      )}
      {showSettings && (
        <button
          type="button"
          className="flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-[1.03] active:scale-95"
          style={{
            width: COLLAPSED_FAB_SIZE,
            height: COLLAPSED_FAB_SIZE,
            backgroundColor: bgColor,
            color: textColor,
          }}
          onClick={() => onSettings?.()}
          aria-label={t("settings")}
        >
          <SettingsIcon className="h-6 w-6" />
        </button>
      )}
      <button
        type="button"
        className="flex items-center justify-center rounded-full font-bold shadow-lg transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-50"
        style={{
          width: COLLAPSED_FAB_SIZE,
          height: COLLAPSED_FAB_SIZE,
          backgroundColor: bgColor,
          color: textColor,
          fontSize: 22,
        }}
        onClick={handleExpand}
        disabled={isAnimatingWindow}
        aria-label={t("expand")}
      >
        R
      </button>
    </div>
  );
}
