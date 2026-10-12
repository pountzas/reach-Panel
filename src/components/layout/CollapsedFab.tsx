import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
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
import { MOTION, prefersReducedMotion } from "../../lib/motion";
import { ModeMenu } from "./ModeMenu";

const FAB_STAGGER_MS = 40;

function fabAppearStyle(index: number, stackEntered: boolean): CSSProperties {
  const reduce = prefersReducedMotion();
  const delay = index * FAB_STAGGER_MS;
  return {
    opacity: stackEntered ? 1 : 0,
    transform: stackEntered ? "scale(1)" : "scale(0.92)",
    transition: reduce
      ? undefined
      : `opacity ${MOTION.fast}ms var(--rp-ease-out) ${delay}ms, transform ${MOTION.fast}ms var(--rp-ease-out) ${delay}ms`,
  };
}

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
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuEntered, setMenuEntered] = useState(false);
  const [stackEntered, setStackEntered] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setStackEntered(true);
      return;
    }
    setStackEntered(false);
    const id = requestAnimationFrame(() => setStackEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (modeMenuOpen) {
      setMenuMounted(true);
      setMenuEntered(false);
      const id = requestAnimationFrame(() => setMenuEntered(true));
      return () => cancelAnimationFrame(id);
    }
    if (!menuMounted) return;
    if (prefersReducedMotion()) {
      setMenuMounted(false);
      setMenuEntered(false);
      return;
    }
    setMenuEntered(false);
    const timeoutId = window.setTimeout(() => {
      setMenuMounted(false);
    }, MOTION.fast);
    return () => window.clearTimeout(timeoutId);
  }, [modeMenuOpen, menuMounted]);

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
      {menuMounted ? (
        <ModeMenu onShowKeyboard={handleExpand} entered={menuEntered} />
      ) : null}
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
            className="group flex items-center justify-center rounded-full shadow-lg transition-[background-color,color] duration-200 disabled:opacity-50"
            style={{
              width: COLLAPSED_FAB_SIZE,
              height: COLLAPSED_FAB_SIZE,
              backgroundColor: listening ? "#dc2626" : bgColor,
              color: listening
                ? "#ffffff"
                : micEnabled
                  ? MIC_FAB_ARMED_ICON_COLOR
                  : textColor,
              ...fabAppearStyle(0, stackEntered),
            }}
            disabled={!micEnabled}
            aria-disabled={!micEnabled}
            onClick={() => void toggleDictation()}
            aria-label={micAriaLabel}
          >
            <span className="flex h-full w-full items-center justify-center transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-95">
              <MicrophoneIcon className="h-6 w-6 transition-colors duration-200" />
            </span>
          </button>
        )}
        {showSettings && (
          <button
            type="button"
            className="group flex items-center justify-center rounded-full shadow-lg"
            style={{
              width: COLLAPSED_FAB_SIZE,
              height: COLLAPSED_FAB_SIZE,
              backgroundColor: bgColor,
              color: textColor,
              ...fabAppearStyle(showDictation ? 1 : 0, stackEntered),
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
            <span className="flex h-full w-full items-center justify-center transition-transform group-hover:scale-[1.03] group-active:scale-95">
              <SettingsIcon className="h-6 w-6" />
            </span>
          </button>
        )}
        <button
          type="button"
          className="group flex items-center justify-center rounded-full font-bold shadow-lg disabled:opacity-50"
          style={{
            width: COLLAPSED_FAB_SIZE,
            height: COLLAPSED_FAB_SIZE,
            backgroundColor: bgColor,
            color: textColor,
            fontSize: 22,
            ...fabAppearStyle(
              (showDictation ? 1 : 0) + (showSettings ? 1 : 0),
              stackEntered,
            ),
          }}
          onClick={() =>
            void (modeMenuOpen ? closeModeMenu() : openModeMenu())
          }
          disabled={isAnimatingWindow}
          aria-haspopup="menu"
          aria-expanded={modeMenuOpen}
          aria-label={t("modeMenuOpen")}
        >
          <span className="flex h-full w-full items-center justify-center transition-transform group-hover:scale-[1.03] group-active:scale-95">
            R
          </span>
        </button>
      </div>
    </div>
  );
}
