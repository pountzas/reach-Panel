import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../stores/appStore";
import {
  nextWindowHeightRatioFromScreenY,
  resolveWindowHeightDragRegion,
  type WindowHeightDragRegion,
} from "../lib/windowHeightDrag";
import {
  isTeachingFullWorkArea,
} from "../lib/v1HiddenFeatures";

type WindowHeightDragRef = {
  region: WindowHeightDragRegion;
  latestRatio: number;
};

type WindowHeightDragHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
};

/**
 * Window-height drag for dedicated grip handles (full header + mini toolbar).
 * Maps absolute screenY → ratio so the top edge tracks the cursor (no clientY
 * feedback while the window resizes under the pointer).
 */
export const useWindowHeightDrag = (): WindowHeightDragHandlers => {
  const settings = useAppStore((s) => s.settings);
  const monitors = useAppStore((s) => s.monitors);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const applyWindowHeightRatioLive = useAppStore((s) => s.applyWindowHeightRatioLive);

  const windowResizeRef = useRef<WindowHeightDragRef | null>(null);
  const resizeRafRef = useRef<number | null>(null);

  const fullWorkArea = isTeachingFullWorkArea({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });

  useEffect((): (() => void) => {
    return () => {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      windowResizeRef.current = null;
    };
  }, []);

  const onWindowHeightPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(".section-no-drag")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const monitor =
      monitors.find((m) => m.id === settings.accessibilityMonitorId) ??
      monitors.find((m) => m.is_primary) ??
      monitors[0];
    if (!monitor) return;

    const region = resolveWindowHeightDragRegion(monitor, {
      fullWorkArea,
      multiMonitor: monitors.length >= 2,
      miniMode: miniModeActive,
    });
    const startRatio = nextWindowHeightRatioFromScreenY(event.screenY, region);
    windowResizeRef.current = {
      region,
      latestRatio: startRatio,
    };
    void applyWindowHeightRatioLive(startRatio);
  };

  const onWindowHeightPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = windowResizeRef.current;
    if (!drag) return;

    const nextRatio = nextWindowHeightRatioFromScreenY(event.screenY, drag.region);
    drag.latestRatio = nextRatio;
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null;
      const current = windowResizeRef.current;
      if (!current) return;
      void applyWindowHeightRatioLive(current.latestRatio);
    });
  };

  const onWindowHeightPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = windowResizeRef.current;
    if (!drag) return;
    windowResizeRef.current = null;
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    void updateSettings({ windowHeightRatio: drag.latestRatio });
  };

  return {
    onPointerDown: onWindowHeightPointerDown,
    onPointerMove: onWindowHeightPointerMove,
    onPointerUp: onWindowHeightPointerUp,
    onPointerCancel: onWindowHeightPointerUp,
  };
};
