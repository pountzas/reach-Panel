import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Rnd, type ResizeEnable } from "react-rnd";
import {
  effectiveSectionHeight,
  layoutToPixels,
  pixelsToLayout,
  sectionHeaderHeightPx,
  toggleSectionMinimized,
  type SectionId,
  type SectionLayout,
} from "../../lib/sectionLayouts";
import {
  adjustRect,
  fitsWithoutOverlap,
  type PixelRect,
} from "../../lib/sectionSnap";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { getSurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import { CloseIcon, ExpandIcon, MinimizeIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { InputAreaViewButtons } from "./InputAreaViewButtons";

const EDGE_SIZE = 6;
const MIN_SECTION_WIDTH = 160;
const MIN_SECTION_HEIGHT = 80;

const ENABLE_RESIZE: ResizeEnable = {
  top: true,
  right: true,
  bottom: true,
  left: true,
  topRight: true,
  topLeft: true,
  bottomRight: true,
  bottomLeft: true,
};

const resizeHandleStyles = {
  top: { height: `${EDGE_SIZE}px`, top: 0, cursor: "ns-resize" },
  right: { width: `${EDGE_SIZE}px`, right: 0, cursor: "ew-resize" },
  bottom: { height: `${EDGE_SIZE}px`, bottom: 0, cursor: "ns-resize" },
  left: { width: `${EDGE_SIZE}px`, left: 0, cursor: "ew-resize" },
  topRight: {
    width: `${EDGE_SIZE * 2}px`,
    height: `${EDGE_SIZE * 2}px`,
    top: 0,
    right: 0,
    cursor: "nesw-resize",
  },
  topLeft: {
    width: `${EDGE_SIZE * 2}px`,
    height: `${EDGE_SIZE * 2}px`,
    top: 0,
    left: 0,
    cursor: "nwse-resize",
  },
  bottomRight: {
    width: `${EDGE_SIZE * 2}px`,
    height: `${EDGE_SIZE * 2}px`,
    right: 0,
    bottom: 0,
    cursor: "nwse-resize",
  },
  bottomLeft: {
    width: `${EDGE_SIZE * 2}px`,
    height: `${EDGE_SIZE * 2}px`,
    left: 0,
    bottom: 0,
    cursor: "nesw-resize",
  },
} as const;

const DISABLE_RESIZE: ResizeEnable = {
  top: false,
  right: false,
  bottom: false,
  left: false,
  topRight: false,
  topLeft: false,
  bottomRight: false,
  bottomLeft: false,
};

const SECTION_TITLE_KEY: Record<SectionId, TranslationKey> = {
  "quick-actions": "quickActions",
  phrases: "phrases",
  "input-row": "keyboard",
};

function EdgeHitArea() {
  return <div className="h-full w-full" aria-hidden />;
}

interface ResizableSectionProps {
  id: SectionId;
  layout: SectionLayout;
  containerWidth: number;
  containerHeight: number;
  siblingRects: PixelRect[];
  onLayoutChange: (id: SectionId, layout: SectionLayout) => void;
  onInteractChange?: (id: SectionId, active: boolean) => void;
  children: ReactNode;
}

export function ResizableSection({
  id,
  layout,
  containerWidth,
  containerHeight,
  siblingRects,
  onLayoutChange,
  onInteractChange,
  children,
}: ResizableSectionProps) {
  const { t } = useTranslation();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const disableMusicTeaching = useAppStore((s) => s.disableMusicTeaching);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const keyboardSectionMode = useAppStore((s) => s.settings.keyboardSectionMode);
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const largeHeaders = useAppStore((s) => s.settings.largeHeaders);
  const showMusicLesson =
    id === "phrases" &&
    musicTeachingEnabled &&
    keyboardSectionMode === "synthesizer";
  const sectionTitleKey: TranslationKey = showMusicLesson
    ? "musicLesson"
    : SECTION_TITLE_KEY[id];
  const surface = getSurfaceColors(appBgColor);
  const interactingRef = useRef(false);
  const lastValidRef = useRef<PixelRect | null>(null);
  const headerResizeRef = useRef<{
    startY: number;
    startTop: number;
    startHeight: number;
    bottom: number;
    width: number;
    x: number;
  } | null>(null);
  const isMinimized = layout.minimized ?? false;
  const showPanelControls = id !== "input-row";
  const headerHeight = sectionHeaderHeightPx(largeHeaders);
  const iconSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-3.5 w-3.5";
  const pixels = layoutToPixels(layout, containerWidth, containerHeight);
  const effectiveHeight = effectiveSectionHeight(
    layout,
    containerHeight,
    largeHeaders,
  );
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
    lastValidRef.current = {
      x: pixels.x,
      y: pixels.y,
      width: pixels.width,
      height: effectiveHeight,
    };
  }, [pixels.x, pixels.y, pixels.width, effectiveHeight]);

  const persistLayout = (rect: PixelRect) => {
    onLayoutChange(id, {
      ...layout,
      ...pixelsToLayout(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        containerWidth,
        containerHeight,
      ),
    });
  };

  const applyRect = (candidate: PixelRect, persist: boolean) => {
    const minHeight = isMinimized ? headerHeight : MIN_SECTION_HEIGHT;
    const adjusted = adjustRect(
      candidate,
      siblingRects,
      containerWidth,
      containerHeight,
      MIN_SECTION_WIDTH,
      minHeight,
    );

    const height = isMinimized ? headerHeight : adjusted.height;
    const finalCandidate = { ...adjusted, height };
    const finalRect = fitsWithoutOverlap(finalCandidate, siblingRects)
      ? finalCandidate
      : (lastValidRef.current ?? finalCandidate);

    setPosition({ x: finalRect.x, y: finalRect.y });
    setSize({ width: finalRect.width, height: finalRect.height });
    lastValidRef.current = finalRect;

    if (persist) {
      persistLayout(finalRect);
    }
  };

  const startInteract = () => {
    interactingRef.current = true;
    setIsActive(true);
    onInteractChange?.(id, true);
    lastValidRef.current = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };
  };

  const endInteract = () => {
    interactingRef.current = false;
    setIsActive(false);
    onInteractChange?.(id, false);
  };

  const handleToggleMinimize = () => {
    onLayoutChange(
      id,
      toggleSectionMinimized(layout, containerHeight, largeHeaders),
    );
  };

  const handleClose = () => {
    switch (id) {
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
        const _exhaustive: never = id;
        void _exhaustive;
        break;
      }
    }
  };

  const onHeaderResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!largeHeaders || isMinimized) return;
    if ((event.target as HTMLElement).closest(".section-no-drag")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startInteract();
    headerResizeRef.current = {
      startY: event.clientY,
      startTop: position.y,
      startHeight: size.height,
      bottom: position.y + size.height,
      width: size.width,
      x: position.x,
    };
  };

  const onHeaderResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = headerResizeRef.current;
    if (!drag) return;

    // Drag up → taller section (top moves up, bottom fixed).
    const delta = event.clientY - drag.startY;
    const nextTop = drag.startTop + delta;
    const nextHeight = drag.bottom - nextTop;
    applyRect(
      {
        x: drag.x,
        y: nextTop,
        width: drag.width,
        height: nextHeight,
      },
      false,
    );
  };

  const onHeaderResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!headerResizeRef.current) return;
    headerResizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    applyRect(
      {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      },
      true,
    );
    endInteract();
  };

  const edgeHandle = <EdgeHitArea />;
  const minHeight = isMinimized ? headerHeight : MIN_SECTION_HEIGHT;
  const maxHeight = isMinimized ? headerHeight : undefined;
  const headerCursor = largeHeaders && !isMinimized ? "ns-resize" : "grab";
  const headerDragClass = largeHeaders ? "" : "section-drag-handle";

  return (
    <Rnd
      position={position}
      size={size}
      bounds="parent"
      minWidth={MIN_SECTION_WIDTH}
      minHeight={minHeight}
      maxHeight={maxHeight}
      dragHandleClassName="section-drag-handle"
      cancel=".section-no-drag"
      disableDragging={largeHeaders}
      enableResizing={isMinimized ? DISABLE_RESIZE : ENABLE_RESIZE}
      resizeHandleStyles={resizeHandleStyles}
      resizeHandleComponent={{
        top: edgeHandle,
        right: edgeHandle,
        bottom: edgeHandle,
        left: edgeHandle,
        topRight: edgeHandle,
        topLeft: edgeHandle,
        bottomRight: edgeHandle,
        bottomLeft: edgeHandle,
      }}
      className={isActive ? "z-30" : "z-10"}
      onDragStart={startInteract}
      onDrag={(_e, data) => {
        applyRect(
          {
            x: data.x,
            y: data.y,
            width: size.width,
            height: size.height,
          },
          false,
        );
      }}
      onDragStop={(_e, data) => {
        applyRect(
          {
            x: data.x,
            y: data.y,
            width: size.width,
            height: size.height,
          },
          true,
        );
        endInteract();
      }}
      onResizeStart={startInteract}
      onResize={(_e, _dir, ref, _delta, pos) => {
        applyRect(
          {
            x: pos.x,
            y: pos.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          },
          false,
        );
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        applyRect(
          {
            x: pos.x,
            y: pos.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          },
          true,
        );
        endInteract();
      }}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-md border shadow-md"
        style={{ backgroundColor: surface.panelBg, borderColor: surface.panelBorder }}
      >
        <div
          className={`${headerDragClass} flex shrink-0 items-center justify-between border-b px-2 active:cursor-grabbing`}
          style={{
            height: headerHeight,
            backgroundColor: surface.panelHeaderBg,
            borderColor: surface.panelBorder,
            cursor: headerCursor,
          }}
          onPointerDown={largeHeaders ? onHeaderResizePointerDown : undefined}
          onPointerMove={largeHeaders ? onHeaderResizePointerMove : undefined}
          onPointerUp={largeHeaders ? onHeaderResizePointerUp : undefined}
          onPointerCancel={largeHeaders ? onHeaderResizePointerUp : undefined}
        >
          <span
            className={`truncate font-medium ${largeHeaders ? "text-sm" : "text-xs"}`}
            style={{ color: surface.panelMutedText }}
          >
            {t(sectionTitleKey)}
          </span>
          {id === "input-row" ? (
            <InputAreaViewButtons />
          ) : (
            showPanelControls && (
              <div className="section-no-drag ml-1 flex shrink-0 items-center gap-0.5">
                <IconActionButton
                  label={isMinimized ? t("expand") : t("minimizeSection")}
                  onClick={handleToggleMinimize}
                  size={iconSize}
                >
                  {isMinimized ? (
                    <ExpandIcon className={iconClass} />
                  ) : (
                    <MinimizeIcon className={iconClass} />
                  )}
                </IconActionButton>
                <IconActionButton
                  label={t("close")}
                  onClick={handleClose}
                  size={iconSize}
                >
                  <CloseIcon className={iconClass} />
                </IconActionButton>
              </div>
            )
          )}
        </div>
        {!isMinimized && (
          <div className="section-no-drag min-h-0 flex-1 overflow-hidden p-1">
            {children}
          </div>
        )}
      </div>
    </Rnd>
  );
}
