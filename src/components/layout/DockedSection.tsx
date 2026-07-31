import type { ReactNode } from "react";
import {
  headerHeightFor,
  type DockedSlot,
  type SectionId,
  type StackableSectionId,
} from "../../lib/sectionStack";
import { getSectionDefinition, isStackableSectionId } from "../../lib/sectionRegistry";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import {
  CloseIcon,
  ExpandIcon,
  MinimizeIcon,
  PinIcon,
} from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { InputAreaViewButtons } from "./InputAreaViewButtons";

const SECTION_TITLE_KEY: Record<SectionId, TranslationKey> = {
  "quick-actions": "quickActions",
  phrases: "phrases",
  "input-row": "keyboard",
};

interface DockedSectionProps {
  slot: DockedSlot;
  width: number;
  children: ReactNode;
  onToggleMinimize: (id: SectionId) => void;
  onUndock: (id: StackableSectionId) => void;
  onReorderDrag: (
    id: StackableSectionId,
    clientX: number,
    clientY: number,
    phase: "start" | "move" | "end",
  ) => void;
  dockHighlight?: boolean;
}

export function DockedSection({
  slot,
  width,
  children,
  onToggleMinimize,
  onUndock,
  onReorderDrag,
  dockHighlight = false,
}: DockedSectionProps) {
  const { t } = useTranslation();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const disableMusicTeaching = useAppStore((s) => s.disableMusicTeaching);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const keyboardSectionMode = useAppStore((s) => s.settings.keyboardSectionMode);
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const largeHeaders = useAppStore((s) => s.settings.largeHeaders);
  const showMusicLesson =
    slot.id === "phrases" &&
    musicTeachingEnabled &&
    keyboardSectionMode === "synthesizer";
  const sectionTitleKey: TranslationKey = showMusicLesson
    ? "musicLesson"
    : SECTION_TITLE_KEY[slot.id];
  const surface = getSurfaceColors(appBgColor);
  const headerHeight = headerHeightFor(largeHeaders);
  const iconSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-3.5 w-3.5";
  const canUndock =
    isStackableSectionId(slot.id) && getSectionDefinition(slot.id).canUndock;
  const showPanelControls = slot.id !== "input-row";

  const handleClose = () => {
    switch (slot.id) {
      case "quick-actions":
        updateSettings({ quickActionsVisible: false });
        break;
      case "phrases":
        if (musicTeachingEnabled) {
          void disableMusicTeaching({ hidePhrases: true });
        } else {
          updateSettings({ phrasesVisible: false });
        }
        break;
      case "input-row":
        break;
      default: {
        const _exhaustive: never = slot.id;
        void _exhaustive;
        break;
      }
    }
  };

  return (
    <div
      className="absolute overflow-hidden rounded-md border shadow-md"
      style={{
        left: 0,
        top: slot.y,
        width,
        height: slot.height,
        backgroundColor: surface.panelBg,
        borderColor: dockHighlight ? surface.panelButtonBg : surface.panelBorder,
        boxShadow: dockHighlight
          ? `0 0 0 2px ${surface.panelButtonBg}`
          : undefined,
        zIndex: 10,
      }}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className="flex shrink-0 cursor-grab items-center justify-between border-b px-2 active:cursor-grabbing"
          style={{
            height: headerHeight,
            backgroundColor: surface.panelHeaderBg,
            borderColor: surface.panelBorder,
          }}
          onPointerDown={(event) => {
            if (!isStackableSectionId(slot.id)) return;
            if ((event.target as HTMLElement).closest(".section-no-drag")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            onReorderDrag(slot.id, event.clientX, event.clientY, "start");
          }}
          onPointerMove={(event) => {
            if (!isStackableSectionId(slot.id)) return;
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            onReorderDrag(slot.id, event.clientX, event.clientY, "move");
          }}
          onPointerUp={(event) => {
            if (!isStackableSectionId(slot.id)) return;
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
              // already released
            }
            onReorderDrag(slot.id, event.clientX, event.clientY, "end");
          }}
          onPointerCancel={(event) => {
            if (!isStackableSectionId(slot.id)) return;
            onReorderDrag(slot.id, event.clientX, event.clientY, "end");
          }}
        >
          <span
            className={`truncate font-medium ${largeHeaders ? "text-sm" : "text-xs"}`}
            style={{ color: surface.panelMutedText }}
          >
            {t(sectionTitleKey)}
          </span>
          {slot.id === "input-row" ? (
            <InputAreaViewButtons />
          ) : (
            showPanelControls && (
              <div className="section-no-drag ml-1 flex shrink-0 items-center gap-0.5">
                {canUndock && (
                  <IconActionButton
                    label={t("undockSection")}
                    onClick={() => {
                      if (isStackableSectionId(slot.id)) onUndock(slot.id);
                    }}
                    size={iconSize}
                    tooltipPlacement="below"
                  >
                    <PinIcon className={iconClass} />
                  </IconActionButton>
                )}
                <IconActionButton
                  label={slot.isMinimized ? t("expand") : t("minimizeSection")}
                  onClick={() => onToggleMinimize(slot.id)}
                  size={iconSize}
                  tooltipPlacement="below"
                >
                  {slot.isMinimized ? (
                    <ExpandIcon className={iconClass} />
                  ) : (
                    <MinimizeIcon className={iconClass} />
                  )}
                </IconActionButton>
                <IconActionButton
                  label={t("close")}
                  onClick={handleClose}
                  size={iconSize}
                  tooltipPlacement="below"
                >
                  <CloseIcon className={iconClass} />
                </IconActionButton>
              </div>
            )
          )}
        </div>
        {!slot.isMinimized && (
          <div className="section-no-drag min-h-0 flex-1 overflow-hidden p-1">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

interface HolePlaceholderProps {
  slot: DockedSlot;
  width: number;
  highlight?: boolean;
}

export function HolePlaceholder({
  slot,
  width,
  highlight = false,
}: HolePlaceholderProps) {
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const surface = getSurfaceColors(appBgColor);

  return (
    <div
      className="pointer-events-none absolute rounded-md border border-dashed"
      style={{
        left: 0,
        top: slot.y,
        width,
        height: slot.height,
        borderColor: highlight ? surface.panelButtonBg : surface.panelBorder,
        backgroundColor: highlight ? surface.panelButtonBg : "transparent",
        opacity: highlight ? 0.35 : 1,
        zIndex: 5,
      }}
      aria-hidden
    />
  );
}
