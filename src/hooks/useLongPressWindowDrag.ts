import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TOUCH_HOLD_MS = 450;
const TOUCH_MOVE_CANCEL_PX = 12;

function isTouchLike(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

async function beginWindowDrag(): Promise<void> {
  try {
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.error("startDragging failed", error);
  }
}

/**
 * Tool-window title-bar drag:
 * - Mouse: immediate OS drag (normal window feel)
 * - Touch/pen: long-press then OS drag
 */
export function useLongPressWindowDrag() {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest(".section-no-drag")) return;

      if (!isTouchLike(event.pointerType)) {
        void beginWindowDrag();
        return;
      }

      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        startRef.current = null;
        void beginWindowDrag();
      }, TOUCH_HOLD_MS);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!startRef.current || timerRef.current == null) return;
      const dx = Math.abs(event.clientX - startRef.current.x);
      const dy = Math.abs(event.clientY - startRef.current.y);
      if (dx > TOUCH_MOVE_CANCEL_PX || dy > TOUCH_MOVE_CANCEL_PX) {
        clear();
      }
    },
    [clear],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}
