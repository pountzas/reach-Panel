import type { KeyboardEvent, MouseEvent } from "react";
import { MicrophoneIcon, SettingsIcon } from "../common/SectionIcons";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import {
  COLLAPSED_FAB_GAP,
  COLLAPSED_FAB_PAD,
  COLLAPSED_FAB_SIZE,
  MIC_FAB_ARMED_ICON_COLOR,
  collapsedFabContentMinSize,
  isMicFabEnabled,
  type CollapsedFabCount,
} from "../../lib/focusMode";
import { ModeMenu } from "./ModeMenu";

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
  const settings = useAppStore((s) => s.settings);
  const toggleCollapsed = useAppStore((s) => s.toggleCollapsed);
  const isAnimatingWindow = useAppStore((s) => s.isAnimatingWindow);
  const dictationState = useAppStore((s) => s.dictationState);
  const sttCapability = useAppStore((s) => s.sttCapability);
  const externalInputFocused = useAppStore((s) => s.externalInputFocused);
  const toggleDictation = useAppStore((s) => s.toggleDictation);
  const modeMenuOpen = useAppStore((s) => s.modeMenuOpen);
  const openModeMenu = useAppStore((s) => s.openModeMenu);
  const closeModeMenu = useAppStore((s) => s.closeModeMenu);
  const { t } = useTranslation();

  const bgColor = settings.headerBgColor ?? "#1e293b";
  const textColor = settings.headerTextColor ?? "#ffffff";

  const listening =
    dictationState === "listening" || dictationState === "processing";
  const canDictate = sttCapability?.canDictate ?? false;
  const micEnabled = isMicFabEnabled({
    dictationState,
    canDictate,
    externalInputFocused,
  });

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

  const handleRootClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && modeMenuOpen) {
      void closeModeMenu();
    }
  };

  const handleRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && modeMenuOpen) {
      event.preventDefault();
      void closeModeMenu();
    }
  };

  let micAriaLabel: string;
  if (listening) {
    micAriaLabel = t("dictationStop");
  } else if (micEnabled) {
    micAriaLabel = t("dictationStart");
  } else if (!canDictate) {
    micAriaLabel =
      sttCapability?.online && !sttCapability.winrtSupported
        ? t("dictationUnavailableUnsupported")
        : t("dictationUnavailableOffline");
  } else {
    micAriaLabel = t("micModeSelectInput");
  }

  return (
    <div
      className="flex h-full w-full flex-row items-end justify-end overflow-visible"
      style={{ background: "transparent" }}
      onClick={handleRootClick}
      onKeyDown={handleRootKeyDown}
    >
      {modeMenuOpen ? <ModeMenu onShowKeyboard={handleExpand} /> : null}
      <div
        className="flex flex-col items-center justify-center"
        style={{
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
              color: listening
                ? "#ffffff"
                : micEnabled
                  ? MIC_FAB_ARMED_ICON_COLOR
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
            onClick={() => {
              if (modeMenuOpen) {
                void closeModeMenu().then(() => onSettings?.());
                return;
              }
              onSettings?.();
            }}
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
          onClick={() =>
            void (modeMenuOpen ? closeModeMenu() : openModeMenu())
          }
          disabled={isAnimatingWindow}
          aria-haspopup="menu"
          aria-expanded={modeMenuOpen}
          aria-label={t("modeMenuOpen")}
        >
          R
        </button>
      </div>
    </div>
  );
}
