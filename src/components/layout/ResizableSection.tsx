import { useEffect, useRef, useState, type ReactNode } from "react";
import { Rnd, type ResizeEnable } from "react-rnd";
import {
  layoutToPixels,
  pixelsToLayout,
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
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const surface = getSurfaceColors(appBgColor);
  const interactingRef = useRef(false);
  const lastValidRef = useRef<PixelRect | null>(null);
  const pixels = layoutToPixels(layout, containerWidth, containerHeight);
  const [position, setPosition] = useState({ x: pixels.x, y: pixels.y });
  const [size, setSize] = useState({
    width: pixels.width,
    height: pixels.height,
  });
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (interactingRef.current) return;
    setPosition({ x: pixels.x, y: pixels.y });
    setSize({ width: pixels.width, height: pixels.height });
    lastValidRef.current = {
      x: pixels.x,
      y: pixels.y,
      width: pixels.width,
      height: pixels.height,
    };
  }, [pixels.x, pixels.y, pixels.width, pixels.height]);

  const persistLayout = (rect: PixelRect) => {
    onLayoutChange(
      id,
      pixelsToLayout(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        containerWidth,
        containerHeight,
      ),
    );
  };

  const applyRect = (candidate: PixelRect, persist: boolean) => {
    const adjusted = adjustRect(
      candidate,
      siblingRects,
      containerWidth,
      containerHeight,
      MIN_SECTION_WIDTH,
      MIN_SECTION_HEIGHT,
    );

    const finalRect = fitsWithoutOverlap(adjusted, siblingRects)
      ? adjusted
      : (lastValidRef.current ?? adjusted);

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

  const edgeHandle = <EdgeHitArea />;

  return (
    <Rnd
      position={position}
      size={size}
      bounds="parent"
      minWidth={MIN_SECTION_WIDTH}
      minHeight={MIN_SECTION_HEIGHT}
      dragHandleClassName="section-drag-handle"
      cancel=".section-no-drag"
      enableResizing={ENABLE_RESIZE}
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
          className="section-drag-handle flex h-7 shrink-0 cursor-grab items-center border-b px-2 active:cursor-grabbing"
          style={{ backgroundColor: surface.panelHeaderBg, borderColor: surface.panelBorder }}
        >
          <span
            className="truncate text-xs font-medium"
            style={{ color: surface.panelMutedText }}
          >
            {t(SECTION_TITLE_KEY[id])}
          </span>
        </div>
        <div className="section-no-drag min-h-0 flex-1 overflow-hidden p-1">
          {children}
        </div>
      </div>
    </Rnd>
  );
}
