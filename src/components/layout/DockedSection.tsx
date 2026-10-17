import { useRef, type ReactNode } from "react";
import {
  headerHeightFor,
  type DockedSlot,
  type SectionId,
  type StackableSectionId,
} from "../../lib/sectionStack";
import { getSectionDefinition, isStackableSectionId } from "../../lib/sectionRegistry";
import { useFlipLayoutTransition } from "../../hooks/useFlipLayoutTransition";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { peekTeachingRestoreMode } from "../../stores/lib/restoreStack";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { lessonCloseAppMode, teachingLessonTitleKey } from "../../lib/appModeLayout";
import type { TranslationKey } from "../../i18n";
import {
  CloseIcon,
  ExpandIcon,
  MinimizeIcon,
  PinIcon,
} from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { InputAreaViewButtons } from "./InputAreaViewButtons";
import { TeachingKeyboardHeaderControls } from "./TeachingKeyboardHeaderControls";
import { TeachingLessonModeToggle } from "../teaching/TeachingLessonModeToggle";
import { isTeachingKeyboardChromeVisible } from "../../lib/teaching/teachingKeyboardMinimize";

const SECTION_TITLE_KEY: Record<SectionId, TranslationKey> = {
  teaching: "modeTeaching",
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
  const setAppMode = useAppStore((s) => s.setAppMode);
  const modeBeforeTeaching = useAppStore((s) =>
    peekTeachingRestoreMode(s.restoreStack),
  );
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const showTeaching = slot.id === "teaching" && musicTeachingEnabled;
  const showKeyboardChrome =
    slot.id === "input-row" &&
    isTeachingKeyboardChromeVisible({
      musicTeachingEnabled,
      teachingLesson,
    });
  const useCenterGrid = showTeaching || showKeyboardChrome;
  const sectionTitleKey: TranslationKey = showTeaching
    ? teachingLessonTitleKey(teachingLesson)
    : SECTION_TITLE_KEY[slot.id];
  const surface = getSurfaceColors(appBgColor);
  const headerHeight = headerHeightFor();
  const iconSize = "sm" as const;
  const iconClass = "h-3.5 w-3.5";
  const canUndock =
    isStackableSectionId(slot.id) && getSectionDefinition(slot.id).canUndock;
  const showPanelControls = slot.id !== "input-row";
  const rootRef = useRef<HTMLDivElement>(null);
  const teachingKeyboardMinimized = useAppStore(
    (s) => s.teachingKeyboardMinimized,
  );
  // Snap top/height in layout; FLIP only when Teaching minimize/restore flips.
  useFlipLayoutTransition(
    rootRef,
    { top: slot.y, height: slot.height },
    teachingKeyboardMinimized,
  );

  const handleClose = () => {
    switch (slot.id) {
      case "teaching":
        if (musicTeachingEnabled) {
          void setAppMode(lessonCloseAppMode(modeBeforeTeaching));
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
      ref={rootRef}
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
          className={`flex shrink-0 cursor-grab items-center border-b px-2 active:cursor-grabbing ${
            useCenterGrid
              ? "grid grid-cols-[1fr_auto_1fr] gap-2"
              : "justify-between"
          }`}
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
            className="min-w-0 truncate text-xs font-medium"
            style={{ color: surface.panelMutedText }}
          >
            {t(sectionTitleKey)}
          </span>
          {showTeaching ? (
            <div className="section-no-drag flex items-center justify-center">
              <TeachingLessonModeToggle />
            </div>
          ) : null}
          {showKeyboardChrome ? <TeachingKeyboardHeaderControls /> : null}
          {slot.id === "input-row" ? (
            <div
              className={
                showKeyboardChrome
                  ? "section-no-drag flex items-center justify-end"
                  : undefined
              }
            >
              <InputAreaViewButtons />
            </div>
          ) : (
            showPanelControls && (
              <div className="section-no-drag ml-1 flex shrink-0 items-center justify-end gap-0.5">
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
