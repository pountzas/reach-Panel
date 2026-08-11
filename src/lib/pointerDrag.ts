import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface PointerDragHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
}

export function usePointerDrag(options: {
  enabled?: boolean;
  onMove: (event: PointerEvent) => void;
  onEnd?: (event: PointerEvent) => void;
}): PointerDragHandlers {
  const activeRef = useRef<{ pointerId: number; captureEl: HTMLElement | null } | null>(
    null,
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const onWindowMove = useCallback((event: PointerEvent) => {
    if (!activeRef.current || activeRef.current.pointerId !== event.pointerId) return;
    optionsRef.current.onMove(event);
  }, []);

  const endDrag = useCallback((event: PointerEvent) => {
    if (!activeRef.current || activeRef.current.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    try {
      activeRef.current.captureEl?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    activeRef.current = null;
    optionsRef.current.onEnd?.(event);
  }, [onWindowMove]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (optionsRef.current.enabled === false) return;
      event.preventDefault();
      const el = event.currentTarget as HTMLElement;
      el.setPointerCapture(event.pointerId);
      activeRef.current = { pointerId: event.pointerId, captureEl: el };
      window.addEventListener("pointermove", onWindowMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [endDrag, onWindowMove],
  );

  return {
    onPointerDown,
    onPointerMove: () => {
      /* window listener handles move */
    },
    onPointerUp: (event) => endDrag(event.nativeEvent),
  };
}
