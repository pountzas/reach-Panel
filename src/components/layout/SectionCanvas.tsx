import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  computeDefaultSectionLayouts,
  hasStaleGap,
  layoutToPixels,
  resolveSectionLayouts,
  type SectionId,
  type SectionLayout,
  type SectionLayouts,
} from "../../lib/sectionLayouts";
import type { PixelRect } from "../../lib/sectionSnap";
import { ResizableSection } from "./ResizableSection";

const HEADER_HEIGHT_ESTIMATE = 48;

interface SectionCanvasProps {
  quickActionsVisible: boolean;
  phrasesVisible: boolean;
  savedLayouts?: SectionLayouts;
  onLayoutsChange: (layouts: SectionLayouts) => void;
  quickActions: ReactNode;
  phrases: ReactNode;
  inputRow: ReactNode;
}

function fallbackCanvasSize() {
  return {
    width: Math.max(320, window.innerWidth),
    height: Math.max(200, window.innerHeight - HEADER_HEIGHT_ESTIMATE),
  };
}

export function SectionCanvas({
  quickActionsVisible,
  phrasesVisible,
  savedLayouts,
  onLayoutsChange,
  quickActions,
  phrases,
  inputRow,
}: SectionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(fallbackCanvasSize);
  const [liveRects, setLiveRects] = useState<Partial<Record<SectionId, PixelRect>>>({});
  const onLayoutsChangeRef = useRef(onLayoutsChange);
  onLayoutsChangeRef.current = onLayoutsChange;

  const updateSize = useCallback(() => {
    const element = containerRef.current;
    if (!element) {
      setContainerSize(fallbackCanvasSize());
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    } else {
      setContainerSize(fallbackCanvasSize());
    }
  }, []);

  useEffect(() => {
    updateSize();
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    const rafId = requestAnimationFrame(updateSize);
    const timeoutId = window.setTimeout(updateSize, 50);
    const timeoutId2 = window.setTimeout(updateSize, 250);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(timeoutId2);
      window.removeEventListener("resize", updateSize);
      observer.disconnect();
    };
  }, [updateSize]);

  const visibility = useMemo(
    () => ({
      quickActions: quickActionsVisible,
      phrases: phrasesVisible,
    }),
    [quickActionsVisible, phrasesVisible],
  );

  const prevVisibilityRef = useRef(visibility);

  // Reset to default stack when visibility changes or saved layouts leave a stale gap.
  useEffect(() => {
    const visibilityChanged =
      prevVisibilityRef.current.quickActions !== visibility.quickActions ||
      prevVisibilityRef.current.phrases !== visibility.phrases;
    prevVisibilityRef.current = visibility;

    if (!visibilityChanged && !hasStaleGap(savedLayouts, visibility)) {
      return;
    }

    const defaults = computeDefaultSectionLayouts(visibility);
    setLiveRects({});
    onLayoutsChangeRef.current(defaults);
  }, [savedLayouts, visibility]);

  const layouts = resolveSectionLayouts(savedLayouts, visibility);

  const sectionRects = useMemo(() => {
    const rects = {} as Record<SectionId, PixelRect>;
    for (const id of Object.keys(layouts) as SectionId[]) {
      rects[id] =
        liveRects[id] ??
        layoutToPixels(layouts[id], containerSize.width, containerSize.height);
    }
    return rects;
  }, [layouts, liveRects, containerSize.width, containerSize.height]);

  const handleLayoutChange = (id: SectionId, layout: SectionLayout) => {
    const rect = layoutToPixels(layout, containerSize.width, containerSize.height);
    setLiveRects((prev) => ({ ...prev, [id]: rect }));
    onLayoutsChange({
      ...savedLayouts,
      [id]: layout,
    });
  };

  const handleInteractChange = (id: SectionId, active: boolean) => {
    if (!active) {
      setLiveRects((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const sections: Array<{ id: SectionId; content: ReactNode }> = [];
  if (quickActionsVisible) {
    sections.push({ id: "quick-actions", content: quickActions });
  }
  if (phrasesVisible) {
    sections.push({ id: "phrases", content: phrases });
  }
  sections.push({ id: "input-row", content: inputRow });

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 overflow-hidden p-1"
      style={{ minHeight: 0, position: "relative" }}
    >
      {sections.map(({ id, content }) => {
        const siblingRects = (Object.keys(sectionRects) as SectionId[])
          .filter((otherId) => otherId !== id)
          .map((otherId) => sectionRects[otherId]);

        return (
          <ResizableSection
            key={id}
            id={id}
            layout={layouts[id]}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            siblingRects={siblingRects}
            onLayoutChange={handleLayoutChange}
            onInteractChange={handleInteractChange}
          >
            {content}
          </ResizableSection>
        );
      })}
    </div>
  );
}
