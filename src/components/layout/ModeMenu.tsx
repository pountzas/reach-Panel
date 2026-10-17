import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  APP_MODE_OPTIONS,
  isTeachingSessionActive,
  resolveSelectedAppMode,
  type AppModeTablet,
} from "../../lib/appModeLayout";
import {
  MODE_MENU_ITEM_HEIGHT,
  MODE_MENU_PAD,
  MODE_MENU_WIDTH,
} from "../../lib/focusMode";
import { MOTION, prefersReducedMotion } from "../../lib/motion";
import { useCompanionTabletEnabled } from "../../hooks/useCompanionTabletEnabled";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";

export interface ModeMenuProps {
  onShowKeyboard: () => void;
  entered?: boolean;
}

function CheckMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

export function ModeMenu({ onShowKeyboard, entered = true }: ModeMenuProps) {
  const { t } = useTranslation();
  const companionTabletEnabled = useCompanionTabletEnabled();
  const settings = useAppStore((s) => s.settings);
  const companionModeActive = useAppStore((s) => s.companionModeActive);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const closeModeMenu = useAppStore((s) => s.closeModeMenu);
  const isAnimatingWindow = useAppStore((s) => s.isAnimatingWindow);

  const menuRef = useRef<HTMLDivElement>(null);

  const teachingActive = isTeachingSessionActive(
    musicTeachingEnabled,
    settings.keyboardSectionMode,
  );
  const selected = resolveSelectedAppMode({
    companionModeActive,
    teachingActive,
    focusModeOverride:
      settings.focusModeOverride === true ? true : undefined,
    micMode: settings.micMode === true,
  });

  const bgColor = settings.headerBgColor ?? "#1e293b";
  const textColor = settings.headerTextColor ?? "#ffffff";
  const reduce = prefersReducedMotion();
  const show = entered || reduce;
  const [promoteLayer, setPromoteLayer] = useState(false);

  useEffect(() => {
    if (reduce) {
      setPromoteLayer(false);
      return;
    }
    setPromoteLayer(true);
  }, [show, reduce]);

  const onShowKeyboardClick = async () => {
    await closeModeMenu();
    onShowKeyboard();
  };

  const onPick = async (id: AppModeTablet) => {
    await closeModeMenu();
    if (id === selected) return;
    await setAppMode(id);
    if (
      (id === "normal" || id === "teaching") &&
      useAppStore.getState().settings.collapsed
    ) {
      await useAppStore.getState().toggleCollapsed();
    }
  };

  const enabledButtons = (): HTMLButtonElement[] => {
    const root = menuRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLButtonElement>("button[role^='menuitem']"),
    ).filter((btn) => !btn.disabled);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void closeModeMenu();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = enabledButtons();
    if (buttons.length === 0) return;
    event.preventDefault();
    const active = document.activeElement;
    const idx = buttons.findIndex((b) => b === active);
    const next =
      event.key === "ArrowDown"
        ? buttons[(idx + 1 + buttons.length) % buttons.length]
        : buttons[(idx - 1 + buttons.length) % buttons.length];
    next?.focus();
  };

  const itemClass =
    "flex w-full items-center gap-2 px-3 text-left text-sm disabled:opacity-50";

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("modeMenuTitle")}
      className="flex shrink-0 flex-col rounded-lg shadow-lg"
      style={{
        width: MODE_MENU_WIDTH,
        paddingTop: MODE_MENU_PAD,
        paddingBottom: MODE_MENU_PAD,
        backgroundColor: bgColor,
        color: textColor,
        opacity: show ? 1 : 0,
        transform: show ? "translateX(0)" : "translateX(8px)",
        transition: reduce
          ? undefined
          : `opacity ${MOTION.fast}ms var(--rp-ease-out), transform ${MOTION.fast}ms var(--rp-ease-out)`,
        willChange: promoteLayer ? "opacity, transform" : undefined,
      }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.propertyName !== "opacity" && event.propertyName !== "transform") {
          return;
        }
        setPromoteLayer(false);
      }}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        style={{ minHeight: MODE_MENU_ITEM_HEIGHT }}
        disabled={isAnimatingWindow}
        onClick={() => void onShowKeyboardClick()}
      >
        {t("modeMenuShowKeyboard")}
      </button>
      <div
        role="separator"
        className="mx-2 h-px shrink-0 opacity-40"
        style={{ backgroundColor: textColor }}
      />
      {APP_MODE_OPTIONS.map((m) => {
        const companionDisabled =
          m.id === "companion" && !companionTabletEnabled;
        const checked = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className={itemClass}
            style={{ minHeight: MODE_MENU_ITEM_HEIGHT }}
            disabled={isAnimatingWindow || companionDisabled}
            title={
              companionDisabled ? t("modeCompanionUnavailable") : undefined
            }
            onClick={() => void onPick(m.id)}
          >
            <span className="inline-flex w-4 shrink-0 justify-center">
              {checked ? <CheckMark /> : null}
            </span>
            <span className="flex-1">{t(m.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
