import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../stores/appStore";
import {
  attachWindowHeightPointerEndListeners,
  nextWindowHeightRatioFromScreenY,
  resolveWindowHeightDragRegion,
  type WindowHeightDragRegion,
} from "../lib/windowHeightDrag";
import { resolveMonitorScaleFactor } from "../lib/toolWindows";
import {
  isTeachingFullWorkArea,
} from "../lib/v1HiddenFeatures";

type WindowHeightDragRef = {
  region: WindowHeightDragRegion;
  latestRatio: number;
  /** Physical→logical scale for GetCursorPos samples. */
  scale: number;
  active: boolean;
  pointerType: string;
};

type WindowHeightDragHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

/**
 * Window-height drag for dedicated grip handles (full header + mini toolbar).
 *
 * Live tracking polls Win32 cursor position: the grip rides the moving top edge,
 * so WebView2 drops JS pointermove once SetWindowPos slides the button away.
 */
export const useWindowHeightDrag = (): WindowHeightDragHandlers => {
  const settings = useAppStore((s) => s.settings);
  const monitors = useAppStore((s) => s.monitors);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const focusModeActive = useAppStore((s) => s.focusModeActive);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const applyWindowHeightRatioLive = useAppStore((s) => s.applyWindowHeightRatioLive);

  const windowResizeRef = useRef<WindowHeightDragRef | null>(null);
  const pollRafRef = useRef<number | null>(null);
  const pointerEndCleanupRef = useRef<(() => void) | null>(null);

  const fullWorkArea = isTeachingFullWorkArea({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });

  const stopPoll = () => {
    if (pollRafRef.current !== null) {
      cancelAnimationFrame(pollRafRef.current);
      pollRafRef.current = null;
    }
  };

  const clearPointerEndListeners = () => {
    pointerEndCleanupRef.current?.();
    pointerEndCleanupRef.current = null;
  };

  useEffect((): (() => void) => {
    return () => {
      if (windowResizeRef.current) {
        windowResizeRef.current.active = false;
      }
      if (pollRafRef.current !== null) {
        cancelAnimationFrame(pollRafRef.current);
        pollRafRef.current = null;
      }
      pointerEndCleanupRef.current?.();
      pointerEndCleanupRef.current = null;
      windowResizeRef.current = null;
    };
  }, []);

  const finishDrag = (ratio: number) => {
    if (windowResizeRef.current) {
      windowResizeRef.current.active = false;
    }
    stopPoll();
    clearPointerEndListeners();
    windowResizeRef.current = null;
    void updateSettings({ windowHeightRatio: ratio });
  };

  const tickPoll = () => {
    const drag = windowResizeRef.current;
    if (!drag?.active) {
      pollRafRef.current = null;
      return;
    }

    void (async () => {
      const current = windowResizeRef.current;
      if (!current?.active) return;

      try {
        if (current.pointerType === "mouse") {
          const down = await invoke<boolean>("cmd_primary_mouse_button_down");
          if (!down) {
            finishDrag(current.latestRatio);
            return;
          }
        }
        const [, physicalY] = await invoke<[number, number]>("cmd_get_cursor_position");
        const screenY = physicalY / current.scale;
        const nextRatio = nextWindowHeightRatioFromScreenY(screenY, current.region);
        current.latestRatio = nextRatio;
        void applyWindowHeightRatioLive(nextRatio);
      } catch {
        // Keep polling; a single IPC blip should not end the gesture.
      }

      if (windowResizeRef.current?.active) {
        pollRafRef.current = requestAnimationFrame(tickPoll);
      }
    })();
  };

  const onWindowHeightPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(".section-no-drag")) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const monitor =
      monitors.find((m) => m.id === settings.accessibilityMonitorId) ??
      monitors.find((m) => m.is_primary) ??
      monitors[0];
    if (!monitor) return;

    stopPoll();

    const scale = resolveMonitorScaleFactor(monitor);
    const region = resolveWindowHeightDragRegion(monitor, {
      fullWorkArea,
      multiMonitor: monitors.length >= 2,
      focusMode: focusModeActive,
    });
    const startRatio = nextWindowHeightRatioFromScreenY(event.screenY, region);
    windowResizeRef.current = {
      region,
      latestRatio: startRatio,
      scale,
      active: true,
      pointerType: event.pointerType,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Optional; polling does not need element capture.
    }

    clearPointerEndListeners();
    pointerEndCleanupRef.current = attachWindowHeightPointerEndListeners(
      event.pointerId,
      () => {
        const drag = windowResizeRef.current;
        if (drag?.active) finishDrag(drag.latestRatio);
      },
    );

    void applyWindowHeightRatioLive(startRatio);
    pollRafRef.current = requestAnimationFrame(tickPoll);
  };

  return {
    onPointerDown: onWindowHeightPointerDown,
  };
};
