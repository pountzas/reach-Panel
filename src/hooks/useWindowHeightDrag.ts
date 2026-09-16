import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "../stores/appStore";
import {
  clampWindowHeightRatio,
  computeContentHeightRatioFromSettings,
} from "../lib/sectionLayouts";
import { nextWindowHeightRatioFromPointerDelta } from "../lib/windowHeightDrag";
import {
  isMusicLessonSlotVisible,
  isTeachingFullWorkArea,
} from "../lib/v1HiddenFeatures";

function monitorRegionHeight(
  monitors: { id: number; height: number; is_primary: boolean }[],
  monitorId: number,
  fullWorkArea: boolean,
): number {
  const monitor =
    monitors.find((m) => m.id === monitorId) ??
    monitors.find((m) => m.is_primary) ??
    monitors[0];
  if (!monitor) return window.innerHeight;
  // Match Rust compute_window_layout: full_work_area or dual-monitor = full
  // work area; single = bottom half.
  return fullWorkArea || monitors.length >= 2 ? monitor.height : monitor.height / 2;
}

function contentHeightRatioFromSettings(
  settings: {
    quickActionsVisible: boolean;
    phrasesVisible: boolean;
    windowHeightRatio?: number;
    keyboardSectionMode: string;
  },
  musicTeachingEnabled: boolean,
): number {
  const lessonSlotVisible = isMusicLessonSlotVisible({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });
  const contentRatio = computeContentHeightRatioFromSettings(
    settings,
    lessonSlotVisible,
  );
  if (settings.windowHeightRatio == null) return contentRatio;
  return Math.max(contentRatio, clampWindowHeightRatio(settings.windowHeightRatio));
}

/**
 * Window-height drag for dedicated grip handles (full header + mini toolbar).
 * No largeHeaders gate — callers attach these handlers only to the grip.
 */
export function useWindowHeightDrag() {
  const settings = useAppStore((s) => s.settings);
  const monitors = useAppStore((s) => s.monitors);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const applyWindowHeightRatioLive = useAppStore((s) => s.applyWindowHeightRatioLive);

  const windowResizeRef = useRef<{
    startY: number;
    startRatio: number;
    regionHeight: number;
    latestRatio: number;
  } | null>(null);
  const resizeRafRef = useRef<number | null>(null);

  const fullWorkArea = isTeachingFullWorkArea({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });

  const onWindowHeightPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(".section-no-drag")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const regionHeight = monitorRegionHeight(
      monitors,
      settings.accessibilityMonitorId,
      fullWorkArea,
    );
    const startRatio = contentHeightRatioFromSettings(settings, musicTeachingEnabled);
    windowResizeRef.current = {
      startY: event.clientY,
      startRatio,
      regionHeight,
      latestRatio: startRatio,
    };
  };

  const onWindowHeightPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = windowResizeRef.current;
    if (!drag) return;

    const nextRatio = nextWindowHeightRatioFromPointerDelta(
      drag.startRatio,
      event.clientY,
      drag.startY,
      drag.regionHeight,
    );
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
}
