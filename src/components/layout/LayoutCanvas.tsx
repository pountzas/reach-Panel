import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  resolveSectionLayouts,
  type SectionId,
  type SectionLayout,
  type SectionLayouts,
} from "../../lib/sectionLayouts";
import { DraggableSection } from "./DraggableSection";

interface LayoutCanvasProps {
  quickActionsVisible: boolean;
  phrasesVisible: boolean;
  suggestionsVisible: boolean;
  savedLayouts?: SectionLayouts;
  onLayoutsChange: (layouts: SectionLayouts) => void;
  quickActions: ReactNode;
  phrases: ReactNode;
  suggestions: ReactNode;
  keyboardMouse: ReactNode;
}

export function LayoutCanvas({
  quickActionsVisible,
  phrasesVisible,
  suggestionsVisible,
  savedLayouts,
  onLayoutsChange,
  quickActions,
  phrases,
  suggestions,
  keyboardMouse,
}: LayoutCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visibility = {
    quickActions: quickActionsVisible,
    phrases: phrasesVisible,
    suggestions: suggestionsVisible,
  };

  const layouts = resolveSectionLayouts(savedLayouts, visibility);

  const handleLayoutChange = (id: SectionId, layout: SectionLayout) => {
    onLayoutsChange({
      ...savedLayouts,
      [id]: layout,
    });
  };

  if (containerSize.width === 0 || containerSize.height === 0) {
    return <div ref={containerRef} className="relative min-h-0 flex-1" />;
  }

  const sections: Array<{ id: SectionId; content: ReactNode }> = [];
  if (quickActionsVisible) {
    sections.push({ id: "quick-actions", content: quickActions });
  }
  if (phrasesVisible) {
    sections.push({ id: "phrases", content: phrases });
  }
  if (suggestionsVisible) {
    sections.push({ id: "suggestions", content: suggestions });
  }
  sections.push({ id: "keyboard-mouse", content: keyboardMouse });

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1">
      {sections.map(({ id, content }) => (
        <DraggableSection
          key={id}
          id={id}
          layout={layouts[id]}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          onLayoutChange={handleLayoutChange}
        >
          {content}
        </DraggableSection>
      ))}
    </div>
  );
}
