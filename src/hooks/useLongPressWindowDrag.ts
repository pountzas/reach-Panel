import {
  useCallback,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function beginWindowDrag(): Promise<void> {
  try {
    // Must run in the same user-gesture turn as pointerdown. Deferred/long-press
    // calls fail on Windows touch (OS drag requires the active pointer message).
    await getCurrentWindow().startDragging();
  } catch (error) {
    console.error("startDragging failed", error);
  }
}

/** Apply on tool-window title bars so touch doesn't scroll/zoom instead of drag. */
export const WINDOW_DRAG_TOUCH_STYLE: CSSProperties = {
  touchAction: "none",
};

/**
 * Tool-window title-bar drag for mouse and touch/pen.
 * Starts OS window drag immediately on primary-button pointerdown.
 */
export function useLongPressWindowDrag() {
  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".section-no-drag")) return;
    void beginWindowDrag();
  }, []);

  return {
    onPointerDown,
  };
}
