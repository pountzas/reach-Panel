import { useEffect, useRef, useState, type ReactNode } from "react";
import { Rnd } from "react-rnd";
import {
  floatRectToPixels,
  headerHeightFor,
  pixelsToFloatRect,
  type FloatRect,
  type StackableSectionId,
} from "../../lib/sectionStack";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { lessonCloseAppMode, teachingLessonTitleKey } from "../../lib/appModeLayout";
import { usePointerDragActive } from "../../lib/pointerDrag";
import type { TranslationKey } from "../../i18n";
import {
  CloseIcon,
  ExpandIcon,
  MinimizeIcon,
  PinIcon,
} from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";

const EDGE_SIZE = 6;
const MIN_SECTION_WIDTH = 160;
const MIN_SECTION_HEIGHT = 80;

const SECTION_TITLE_KEY: Record<StackableSectionId, TranslationKey> = {
  "quick-actions": "quickActions",
  phrases: "phrases",
};

interface FloatingSectionProps {
  id: StackableSectionId;
  rect: FloatRect;
  minimized: boolean;
  containerWidth: number;
  containerHeight: number;
  children: ReactNode;
  onRectChange: (id: StackableSectionId, rect: FloatRect) => void;
  onDock: (id: StackableSectionId) => void;
  onToggleMinimize: (id: StackableSectionId) => void;
  onDropProbe: (id: StackableSectionId, clientX: number, clientY: number) => void;
  onDragStop: (id: StackableSectionId) => void;
}

export function FloatingSection({
  id,
  rect,
  minimized,
  containerWidth,
  containerHeight,
  children,
  onRectChange,
  onDock,
  onToggleMinimize,
  onDropProbe,
  onDragStop,
}: FloatingSectionProps) {
  const { t } = useTranslation();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const modeBeforeTeaching = useAppStore((s) => s.modeBeforeTeaching);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const keyboardSectionMode = useAppStore((s) => s.settings.keyboardSectionMode);
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const largeHeaders = useAppStore((s) => s.settings.largeHeaders);
  const pointerDragActive = usePointerDragActive();
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const showMusicLesson =
    id === "phrases" &&
    musicTeachingEnabled &&
    keyboardSectionMode === "synthesizer";
  const sectionTitleKey: TranslationKey = showMusicLesson
    ? teachingLessonTitleKey(teachingLesson)
    : SECTION_TITLE_KEY[id];
  const surface = getSurfaceColors(appBgColor);
  const headerHeight = headerHeightFor(largeHeaders);
  const iconSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-3.5 w-3.5";
  const pixels = floatRectToPixels(rect, containerWidth, containerHeight);
  const effectiveHeight = minimized ? headerHeight : pixels.height;
  const interactingRef = useRef(false);
  const [position, setPosition] = useState({ x: pixels.x, y: pixels.y });
  const [size, setSize] = useState({
    width: pixels.width,
    height: effectiveHeight,
  });
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (interactingRef.current) return;
    setPosition({ x: pixels.x, y: pixels.y });
    setSize({ width: pixels.width, height: effectiveHeight });
  }, [pixels.x, pixels.y, pixels.width, effectiveHeight]);

  const persist = (x: number, y: number, width: number, height: number) => {
    onRectChange(
      id,
      pixelsToFloatRect(x, y, width, height, containerWidth, containerHeight),
    );
  };

  const handleClose = () => {
    switch (id) {
      case "quick-actions":
        updateSettings({ quickActionsVisible: false });
        break;
      case "phrases":
        if (musicTeachingEnabled) {
          void setAppMode(lessonCloseAppMode(modeBeforeTeaching));
        } else {
          updateSettings({ phrasesVisible: false });
        }
        break;
      default: {
        const _exhaustive: never = id;
        void _exhaustive;
        break;
      }
    }
  };

  const resizingEnabled =
    !pointerDragActive &&
    !minimized && {
      top: true,
      right: true,
      bottom: true,
      left: true,
      topRight: true,
      topLeft: true,
      bottomRight: true,
      bottomLeft: true,
    };

  return (
    <Rnd
      position={position}
      size={size}
      bounds="parent"
      minWidth={MIN_SECTION_WIDTH}
      minHeight={minimized ? headerHeight : MIN_SECTION_HEIGHT}
      maxHeight={minimized ? headerHeight : undefined}
      dragHandleClassName="section-drag-handle"
      cancel=".section-no-drag"
      disableDragging={pointerDragActive}
      enableResizing={resizingEnabled}
      resizeHandleStyles={{
        top: {
          height: `${EDGE_SIZE}px`,
          top: 0,
          cursor: "ns-resize",
          touchAction: "none",
        },
        right: {
          width: `${EDGE_SIZE}px`,
          right: 0,
          cursor: "ew-resize",
          touchAction: "none",
        },
        bottom: {
          height: `${EDGE_SIZE}px`,
          bottom: 0,
          cursor: "ns-resize",
          touchAction: "none",
        },
        left: {
          width: `${EDGE_SIZE}px`,
          left: 0,
          cursor: "ew-resize",
          touchAction: "none",
        },
        topRight: { touchAction: "none" },
        topLeft: { touchAction: "none" },
        bottomRight: { touchAction: "none" },
        bottomLeft: { touchAction: "none" },
      }}
      className={isActive ? "z-40" : "z-30"}
      onDragStart={() => {
        interactingRef.current = true;
        setIsActive(true);
      }}
      onDrag={(_e, data) => {
        setPosition({ x: data.x, y: data.y });
        onDropProbe(id, data.x + size.width / 2, data.y + headerHeight / 2);
      }}
      onDragStop={(_e, data) => {
        interactingRef.current = false;
        setIsActive(false);
        setPosition({ x: data.x, y: data.y });
        onDropProbe(id, data.x + size.width / 2, data.y + headerHeight / 2);
        persist(data.x, data.y, size.width, size.height);
        onDragStop(id);
      }}
      onResizeStart={() => {
        interactingRef.current = true;
        setIsActive(true);
      }}
      onResize={(_e, _dir, ref, _delta, pos) => {
        setPosition({ x: pos.x, y: pos.y });
        setSize({ width: ref.offsetWidth, height: ref.offsetHeight });
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        interactingRef.current = false;
        setIsActive(false);
        const next = {
          x: pos.x,
          y: pos.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        };
        setPosition({ x: next.x, y: next.y });
        setSize({ width: next.width, height: next.height });
        persist(next.x, next.y, next.width, next.height);
      }}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-md border shadow-lg"
        style={{
          backgroundColor: surface.panelBg,
          borderColor: surface.panelBorder,
        }}
      >
        <div
          className="section-drag-handle flex shrink-0 cursor-grab items-center justify-between border-b px-2 active:cursor-grabbing"
          style={{
            height: headerHeight,
            backgroundColor: surface.panelHeaderBg,
            borderColor: surface.panelBorder,
            touchAction: "none",
          }}
        >
          <span
            className={`truncate font-medium ${largeHeaders ? "text-sm" : "text-xs"}`}
            style={{ color: surface.panelMutedText }}
          >
            {t(sectionTitleKey)}
          </span>
          <div className="section-no-drag ml-1 flex shrink-0 items-center gap-0.5">
            <IconActionButton
              label={t("dockSection")}
              onClick={() => onDock(id)}
              size={iconSize}
              tooltipPlacement="below"
            >
              <PinIcon className={iconClass} />
            </IconActionButton>
            <IconActionButton
              label={minimized ? t("expand") : t("minimizeSection")}
              onClick={() => onToggleMinimize(id)}
              size={iconSize}
              tooltipPlacement="below"
            >
              {minimized ? (
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
        </div>
        {!minimized && (
          <div className="section-no-drag min-h-0 flex-1 overflow-hidden p-1">
            {children}
          </div>
        )}
      </div>
    </Rnd>
  );
}
