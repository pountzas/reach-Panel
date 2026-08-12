import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface PointerDragHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
}

let activeDragCount = 0;
const activeListeners = new Set<() => void>();

function notifyPointerDragActive() {
  for (const listener of activeListeners) {
    listener();
  }
}

function setPointerDragActive(active: boolean) {
  const wasActive = activeDragCount > 0;
  if (active) {
    activeDragCount += 1;
  } else {
    activeDragCount = Math.max(0, activeDragCount - 1);
  }
  if ((activeDragCount > 0) !== wasActive) {
    notifyPointerDragActive();
  }
}

export function isPointerDragActive(): boolean {
  return activeDragCount > 0;
}

export function subscribePointerDragActive(listener: () => void): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

/** True while any `usePointerDrag` gesture is in progress (splitter, etc.). */
export function usePointerDragActive(): boolean {
  return useSyncExternalStore(
    subscribePointerDragActive,
    isPointerDragActive,
    () => false,
  );
}

/** Test helper — reset module flag between tests. */
export function __resetPointerDragActiveForTests(): void {
  activeDragCount = 0;
  notifyPointerDragActive();
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
    setPointerDragActive(false);
    optionsRef.current.onEnd?.(event);
  }, [onWindowMove]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (optionsRef.current.enabled === false) return;
      event.preventDefault();
      const el = event.currentTarget as HTMLElement;
      el.setPointerCapture(event.pointerId);
      activeRef.current = { pointerId: event.pointerId, captureEl: el };
      setPointerDragActive(true);
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
