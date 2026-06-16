import { useEffect, useState, type ReactNode } from "react";
import { Rnd } from "react-rnd";
import {
  layoutToPixels,
  pixelsToLayout,
  type SectionId,
  type SectionLayout,
} from "../../lib/sectionLayouts";
import { useTranslation } from "../../hooks/useTranslation";

const HANDLE_SIZE = 36;
const MIN_SECTION_WIDTH = 160;
const MIN_SECTION_HEIGHT = 80;

const resizeHandleStyles = {
  bottom: {
    height: `${HANDLE_SIZE}px`,
    bottom: 0,
    cursor: "ns-resize",
  },
  right: {
    width: `${HANDLE_SIZE}px`,
    right: 0,
    cursor: "ew-resize",
  },
  bottomRight: {
    width: `${HANDLE_SIZE}px`,
    height: `${HANDLE_SIZE}px`,
    right: 0,
    bottom: 0,
    cursor: "nwse-resize",
  },
} as const;

function ResizeHandle({ className }: { className: string }) {
  return (
    <div
      className={`rounded-sm border-2 border-white bg-slate-600 shadow-md ${className}`}
      aria-hidden
    />
  );
}

interface DraggableSectionProps {
  id: SectionId;
  layout: SectionLayout;
  containerWidth: number;
  containerHeight: number;
  onLayoutChange: (id: SectionId, layout: SectionLayout) => void;
  children: ReactNode;
  className?: string;
}

export function DraggableSection({
  id,
  layout,
  containerWidth,
  containerHeight,
  onLayoutChange,
  children,
  className = "",
}: DraggableSectionProps) {
  const { t } = useTranslation();
  const [editMode, setEditMode] = useState(false);
  const pixels = layoutToPixels(layout, containerWidth, containerHeight);
  const [position, setPosition] = useState({ x: pixels.x, y: pixels.y });
  const [size, setSize] = useState({
    width: pixels.width,
    height: pixels.height,
  });

  useEffect(() => {
    setPosition({ x: pixels.x, y: pixels.y });
    setSize({ width: pixels.width, height: pixels.height });
  }, [pixels.x, pixels.y, pixels.width, pixels.height]);

  const persistLayout = (x: number, y: number, width: number, height: number) => {
    onLayoutChange(
      id,
      pixelsToLayout(x, y, width, height, containerWidth, containerHeight),
    );
  };

  return (
    <Rnd
      position={position}
      size={size}
      bounds="parent"
      minWidth={MIN_SECTION_WIDTH}
      minHeight={MIN_SECTION_HEIGHT}
      disableDragging={!editMode}
      enableResizing={
        editMode
          ? { bottom: true, right: true, bottomRight: true }
          : false
      }
      resizeHandleStyles={resizeHandleStyles}
      resizeHandleComponent={{
        bottom: <ResizeHandle className="mx-auto h-3 w-16" />,
        right: <ResizeHandle className="my-auto h-16 w-3" />,
        bottomRight: <ResizeHandle className="h-9 w-9" />,
      }}
      dragHandleClassName="section-drag-handle"
      cancel=".section-no-drag"
      className={`z-10 ${editMode ? "z-20" : ""}`}
      onDrag={(_e, data) => {
        setPosition({ x: data.x, y: data.y });
      }}
      onDragStop={(_e, data) => {
        persistLayout(data.x, data.y, size.width, size.height);
      }}
      onResize={(_e, _dir, ref, _delta, pos) => {
        setPosition(pos);
        setSize({ width: ref.offsetWidth, height: ref.offsetHeight });
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        persistLayout(pos.x, pos.y, ref.offsetWidth, ref.offsetHeight);
      }}
    >
      <div
        className={`flex h-full flex-col overflow-hidden rounded-lg bg-white/90 shadow-sm ${
          editMode ? "ring-2 ring-blue-500 ring-offset-1" : ""
        } ${className}`}
      >
        {editMode ? (
          <div className="section-drag-handle flex min-h-11 shrink-0 cursor-grab items-center gap-2 bg-slate-700 px-2 active:cursor-grabbing">
            <span className="flex-1 text-center text-sm font-medium text-white">
              {t("dragToMove")}
            </span>
            <button
              type="button"
              className="section-no-drag min-h-11 shrink-0 rounded-lg bg-blue-500 px-4 text-xs font-semibold text-white"
              onClick={() => setEditMode(false)}
              aria-pressed
            >
              {t("layoutEditDone")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="section-no-drag absolute right-1 top-1 z-10 min-h-11 min-w-11 rounded-lg bg-white/95 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            onClick={() => setEditMode(true)}
            aria-pressed={false}
            title={t("layoutEdit")}
          >
            {t("layoutEdit")}
          </button>
        )}
        <div
          className={`section-no-drag min-h-0 flex-1 overflow-auto p-2 ${
            editMode ? "" : "pt-12"
          }`}
        >
          {children}
        </div>
      </div>
    </Rnd>
  );
}
