import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { appHeaderHeightPx } from "../../lib/sectionLayouts";
import { usePointerDrag } from "../../lib/pointerDrag";
import { isStackableSectionId } from "../../lib/sectionRegistry";
import {
  SPLITTER_HIT_PX,
  STACK_GAP_PX,
  UNDOCK_DRAG_THRESHOLD_PX,
  applySplitterDelta,
  defaultFloatRectFromSlot,
  dockSection,
  reorderStack,
  resolveDockedSlots,
  resolveSectionStack,
  toggleStackMinimized,
  undockSection,
  updateFloatRect,
  type DockedSlot,
  type FloatRect,
  type LegacySectionLayouts,
  type SectionId,
  type SectionStackState,
  type SectionVisibility,
  type StackableSectionId,
} from "../../lib/sectionStack";
import { useAppStore } from "../../stores/appStore";
import { DockedSection, HolePlaceholder } from "./DockedSection";
import { FloatingSection } from "./FloatingSection";

interface SectionCanvasProps {
  quickActionsVisible: boolean;
  phrasesVisible: boolean;
  savedStack?: SectionStackState;
  legacyLayouts?: LegacySectionLayouts;
  onStackChange: (stack: SectionStackState) => void;
  quickActions: ReactNode;
  phrases: ReactNode;
  inputRow: ReactNode;
}

export function SectionCanvas({
  quickActionsVisible,
  phrasesVisible,
  savedStack,
  legacyLayouts,
  onStackChange,
  quickActions,
  phrases,
  inputRow,
}: SectionCanvasProps) {
  const largeHeaders = useAppStore((s) => s.settings.largeHeaders);
  const headerEstimate = appHeaderHeightPx(largeHeaders);

  const fallbackCanvasSize = useCallback(() => {
    return {
      width: Math.max(320, window.innerWidth),
      height: Math.max(200, window.innerHeight - headerEstimate),
    };
  }, [headerEstimate]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(fallbackCanvasSize);
  const onStackChangeRef = useRef(onStackChange);
  onStackChangeRef.current = onStackChange;

  const dragRef = useRef<{
    id: StackableSectionId;
    startClientX: number;
    startClientY: number;
    undocked: boolean;
  } | null>(null);
  const splitterRef = useRef<{
    upperId: SectionId;
    lowerId: SectionId;
    lastY: number;
  } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<StackableSectionId | null>(
    null,
  );
  const dropTargetRef = useRef<StackableSectionId | null>(null);
  const insertionIndexRef = useRef<number | null>(null);

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
  }, [fallbackCanvasSize]);

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

  const visibility: SectionVisibility = useMemo(
    () => ({
      quickActions: quickActionsVisible,
      phrases: phrasesVisible,
    }),
    [quickActionsVisible, phrasesVisible],
  );

  const stackFromSettings = useMemo(
    () => resolveSectionStack(savedStack, legacyLayouts),
    [savedStack, legacyLayouts],
  );
  const [stack, setStack] = useState(stackFromSettings);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    setStack(stackFromSettings);
  }, [stackFromSettings]);

  // Hide clears float state so the next show always re-docks (remembered weight stays).
  useEffect(() => {
    const current = stackRef.current;
    let next = current;
    if (!visibility.quickActions && current.undocked["quick-actions"]) {
      next = dockSection(next, "quick-actions");
    }
    if (!visibility.phrases && current.undocked.phrases) {
      next = dockSection(next, "phrases");
    }
    if (next !== current) {
      setStack(next);
      stackRef.current = next;
      onStackChangeRef.current(next);
    }
  }, [visibility.quickActions, visibility.phrases]);

  useEffect(() => {
    if (savedStack && Array.isArray(savedStack.order)) return;
    if (!legacyLayouts || Object.keys(legacyLayouts).length === 0) return;
    onStackChangeRef.current(stackFromSettings);
  }, [savedStack, legacyLayouts, stackFromSettings]);

  const contentById: Record<SectionId, ReactNode> = {
    "quick-actions": quickActions,
    phrases: phrases,
    "input-row": inputRow,
  };

  const slots = useMemo(
    () =>
      resolveDockedSlots(
        stack,
        visibility,
        containerSize.height,
        largeHeaders,
        STACK_GAP_PX,
      ),
    [stack, visibility, containerSize.height, largeHeaders],
  );

  const slotById = useMemo(() => {
    const map = new Map<SectionId, DockedSlot>();
    for (const slot of slots) map.set(slot.id, slot);
    return map;
  }, [slots]);

  const persist = (next: SectionStackState) => {
    setStack(next);
    stackRef.current = next;
    onStackChange(next);
  };

  const handleToggleMinimize = (id: SectionId) => {
    persist(toggleStackMinimized(stackRef.current, id));
  };

  const handleUndock = (id: StackableSectionId) => {
    const slot = slotById.get(id);
    if (!slot || slot.isHole) return;
    const rect = defaultFloatRectFromSlot(
      slot,
      containerSize.width,
      containerSize.height,
    );
    persist(undockSection(stackRef.current, id, rect));
  };

  const handleDock = (id: StackableSectionId) => {
    persist(dockSection(stackRef.current, id));
    dropTargetRef.current = null;
    setDropTargetId(null);
  };

  const handleFloatRect = (id: StackableSectionId, rect: FloatRect) => {
    persist(updateFloatRect(stackRef.current, id, rect));
  };

  const findHoleAt = (x: number, y: number): StackableSectionId | null => {
    for (const slot of slots) {
      if (!slot.isHole || !isStackableSectionId(slot.id)) continue;
      if (
        y >= slot.y &&
        y <= slot.y + slot.height &&
        x >= 0 &&
        x <= containerSize.width
      ) {
        return slot.id;
      }
    }
    return null;
  };

  const setDropTarget = (id: StackableSectionId | null) => {
    dropTargetRef.current = id;
    setDropTargetId(id);
  };

  const handleDropProbe = (id: StackableSectionId, canvasX: number, canvasY: number) => {
    const hole = findHoleAt(canvasX, canvasY);
    setDropTarget(hole === id ? id : null);
  };

  const handleFloatDragStop = (id: StackableSectionId) => {
    if (dropTargetRef.current === id) {
      persist(dockSection(stackRef.current, id));
    }
    setDropTarget(null);
  };

  const handleReorderDrag = (
    id: StackableSectionId,
    clientX: number,
    clientY: number,
    phase: "start" | "move" | "end",
  ) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();

    if (phase === "start") {
      dragRef.current = {
        id,
        startClientX: clientX,
        startClientY: clientY,
        undocked: false,
      };
      insertionIndexRef.current = null;
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.id !== id) return;

    const localY = clientY - bounds.top;
    const dx = clientX - drag.startClientX;

    if (phase === "move") {
      // Horizontal pull undocks; vertical drag reorders.
      if (!drag.undocked && Math.abs(dx) > UNDOCK_DRAG_THRESHOLD_PX) {
        drag.undocked = true;
        handleUndock(id);
        dragRef.current = null;
        insertionIndexRef.current = null;
        return;
      }

      const order = stackRef.current.order.filter((oid) =>
        slots.some((s) => s.id === oid),
      );
      const stackableSlots = slots.filter((s) => isStackableSectionId(s.id));
      let nextIndex = stackableSlots.length;
      for (let i = 0; i < stackableSlots.length; i++) {
        const s = stackableSlots[i]!;
        if (localY < s.y + s.height / 2) {
          nextIndex = i;
          break;
        }
      }
      const fromIndex = order.indexOf(id);
      let adjusted = nextIndex;
      if (fromIndex >= 0 && nextIndex > fromIndex) {
        adjusted = nextIndex - 1;
      }
      insertionIndexRef.current = adjusted;
      return;
    }

    if (!drag.undocked && insertionIndexRef.current != null) {
      persist(reorderStack(stackRef.current, id, insertionIndexRef.current));
    }
    dragRef.current = null;
    insertionIndexRef.current = null;
  };

  const splitterDrag = usePointerDrag({
    onMove: (event) => {
      const split = splitterRef.current;
      if (!split) return;
      const delta = event.clientY - split.lastY;
      split.lastY = event.clientY;
      if (delta === 0) return;
      persist(
        applySplitterDelta(
          stackRef.current,
          split.upperId,
          split.lowerId,
          delta,
          containerSize.height,
          visibility,
          largeHeaders,
        ),
      );
    },
    onEnd: () => {
      splitterRef.current = null;
    },
  });

  const onSplitterPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    upperId: SectionId,
    lowerId: SectionId,
  ) => {
    splitterRef.current = { upperId, lowerId, lastY: event.clientY };
    splitterDrag.onPointerDown(event);
  };

  const floatingIds = (Object.keys(stack.undocked) as StackableSectionId[]).filter(
    (id) => stack.undocked[id] != null && isSectionVisibleId(id, visibility),
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 overflow-hidden p-1"
      style={{ minHeight: 0, position: "relative" }}
    >
      {slots.map((slot) => {
        if (slot.isHole && isStackableSectionId(slot.id)) {
          return (
            <HolePlaceholder
              key={`hole-${slot.id}`}
              slot={slot}
              width={containerSize.width}
              highlight={dropTargetId === slot.id}
            />
          );
        }
        return (
          <DockedSection
            key={slot.id}
            slot={slot}
            width={containerSize.width}
            onToggleMinimize={handleToggleMinimize}
            onUndock={handleUndock}
            onReorderDrag={handleReorderDrag}
          >
            {contentById[slot.id]}
          </DockedSection>
        );
      })}

      {slots.slice(0, -1).map((slot, index) => {
        const lower = slots[index + 1];
        if (!lower) return null;
        if (slot.isMinimized || lower.isMinimized) return null;
        const top = slot.y + slot.height;
        return (
          <div
            key={`split-${slot.id}-${lower.id}`}
            className="absolute left-0 z-20 cursor-ns-resize"
            style={{
              top: top - SPLITTER_HIT_PX / 2,
              width: containerSize.width,
              height: SPLITTER_HIT_PX,
              touchAction: "none",
            }}
            onPointerDown={(e) => onSplitterPointerDown(e, slot.id, lower.id)}
            onPointerMove={splitterDrag.onPointerMove}
            onPointerUp={splitterDrag.onPointerUp}
          />
        );
      })}

      {floatingIds.map((id) => {
        const rect = stack.undocked[id];
        if (!rect) return null;
        return (
          <FloatingSection
            key={`float-${id}`}
            id={id}
            rect={rect}
            minimized={Boolean(stack.minimized[id])}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            onRectChange={handleFloatRect}
            onDock={handleDock}
            onToggleMinimize={(sectionId) => handleToggleMinimize(sectionId)}
            onDropProbe={handleDropProbe}
            onDragStop={handleFloatDragStop}
          >
            {contentById[id]}
          </FloatingSection>
        );
      })}
    </div>
  );
}

function isSectionVisibleId(
  id: StackableSectionId,
  visibility: SectionVisibility,
): boolean {
  switch (id) {
    case "quick-actions":
      return visibility.quickActions;
    case "phrases":
      return visibility.phrases;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
