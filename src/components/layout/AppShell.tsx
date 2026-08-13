import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { KeyboardSection } from "../keyboard/KeyboardSection";
import { MousePanel } from "../mouse/MousePanel";
import { MOUSE_PANEL_MIN_WIDTH } from "../../lib/mousePanelLayout";
import { QuickActionsBar } from "../quick-actions/QuickActionsBar";
import { PhrasePanel } from "../phrases/PhrasePanel";
import { MusicLessonPanel } from "../music/MusicLessonPanel";
import { ErrorBanner } from "../common/ErrorBanner";
import { SectionCanvas } from "./SectionCanvas";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { CollapseIcon, CloseIcon, SettingsIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { CollapsedFab } from "./CollapsedFab";
import { MiniModeShell } from "./MiniModeShell";
import {
  appHeaderHeightPx,
  clampWindowHeightRatio,
  computeContentHeightRatioFromSettings,
} from "../../lib/sectionLayouts";
import { closeAllToolWindows } from "../../lib/toolWindows";
import { resolveMiniModeEnabled } from "../../lib/miniMode";
import {
  effectiveLargeHeaders,
  effectiveMouseVisible,
  effectiveQuickActionsVisible,
  isMusicLessonSlotVisible,
  isV1FeatureHidden,
  resolveV1SectionVisibility,
} from "../../lib/v1HiddenFeatures";

function InputRowPanel() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const mouseSide = settings.mousePanelSide ?? "right";
  const mouseRatio = settings.inputRowRightRatio ?? 0.28;
  const mouseVisible = effectiveMouseVisible(settings.mouseVisible);

  // Always keep KeyboardSection in the same split-pane slot so synth playback
  // is not remounted when show/hide mouse toggles. 5-octave mode sets
  // mouseVisible=false the same way the hide button does. v1 mouse flag forces
  // the mouse pane collapsed; flip the flag off to restore the column.
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <ResizableSplitPane
        ratioSide={mouseSide === "left" ? "left" : "right"}
        rightRatio={mouseRatio}
        onRightRatioChange={(inputRowRightRatio) =>
          updateSettings({ inputRowRightRatio })
        }
        minLeftWidth={mouseSide === "left" ? MOUSE_PANEL_MIN_WIDTH : 160}
        minRightWidth={mouseSide === "left" ? 160 : MOUSE_PANEL_MIN_WIDTH}
        sizedPaneCollapsed={!mouseVisible}
        left={mouseSide === "left" ? <MousePanel /> : <KeyboardSection />}
        right={mouseSide === "left" ? <KeyboardSection /> : <MousePanel />}
      />
    </div>
  );
}

function monitorRegionHeight(
  monitors: { id: number; height: number; is_primary: boolean }[],
  monitorId: number,
): number {
  const monitor =
    monitors.find((m) => m.id === monitorId) ??
    monitors.find((m) => m.is_primary) ??
    monitors[0];
  if (!monitor) return window.innerHeight;
  // Match Rust compute_window_layout: dual-monitor = full work area; single = bottom half.
  return monitors.length >= 2 ? monitor.height : monitor.height / 2;
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

export function AppShell() {
  const settings = useAppStore((s) => s.settings);
  const monitors = useAppStore((s) => s.monitors);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const toggleCollapsed = useAppStore((s) => s.toggleCollapsed);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const applyWindowHeightRatioLive = useAppStore((s) => s.applyWindowHeightRatioLive);
  const isAnimatingWindow = useAppStore((s) => s.isAnimatingWindow);
  const musicTeachingEnabled = useAppStore((s) => s.musicTeachingEnabled);
  const { t } = useTranslation();
  const largeHeaders = effectiveLargeHeaders(settings.largeHeaders);
  const headerHeight = appHeaderHeightPx(largeHeaders);
  const iconSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-4 w-4";
  const lessonSlotVisible = isMusicLessonSlotVisible({
    musicTeachingEnabled,
    keyboardSectionMode: settings.keyboardSectionMode,
  });
  const sectionVisibility = resolveV1SectionVisibility({
    quickActionsVisible: settings.quickActionsVisible,
    phrasesVisible: settings.phrasesVisible,
    lessonSlotVisible,
  });
  const quickActionsVisible = effectiveQuickActionsVisible(settings.quickActionsVisible);
  const phrasesSlotVisible = sectionVisibility.phrases;
  const windowResizeRef = useRef<{
    startY: number;
    startRatio: number;
    regionHeight: number;
    latestRatio: number;
  } | null>(null);
  const resizeRafRef = useRef<number | null>(null);

  const handleCloseApp = () => {
    void closeAllToolWindows().finally(() => {
      void exit(0);
    });
  };

  const onWindowHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!largeHeaders) return;
    if ((event.target as HTMLElement).closest(".section-no-drag")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const regionHeight = monitorRegionHeight(monitors, settings.accessibilityMonitorId);
    const startRatio = contentHeightRatioFromSettings(settings, musicTeachingEnabled);
    windowResizeRef.current = {
      startY: event.clientY,
      startRatio,
      regionHeight,
      latestRatio: startRatio,
    };
  };

  const onWindowHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = windowResizeRef.current;
    if (!drag) return;

    // Drag up → taller window (bottom edge fixed).
    const delta = event.clientY - drag.startY;
    const nextRatio = clampWindowHeightRatio(
      drag.startRatio - delta / drag.regionHeight,
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

  const onWindowHeaderPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
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

  // Mini Mode: keyboard+suggestions or collapsed FAB — not the full app chrome.
  if (monitors.length > 0 && resolveMiniModeEnabled(settings, monitors)) {
    return <MiniModeShell />;
  }

  if (settings.collapsed) {
    return <CollapsedFab />;
  }

  const shellStyle: CSSProperties = {
    backgroundColor: settings.appBgColor ?? "#f1f5f9",
  };

  if (settings.backgroundImagePath) {
    shellStyle.backgroundImage = `url("${convertFileSrc(settings.backgroundImagePath)}")`;
    shellStyle.backgroundSize = "cover";
    shellStyle.backgroundPosition = "center";
    shellStyle.backgroundRepeat = "no-repeat";
  }

  const phrasesContent = lessonSlotVisible ? (
    <MusicLessonPanel />
  ) : isV1FeatureHidden("phrases") ? null : (
    <PhrasePanel />
  );

  return (
    <div
      className="relative flex min-h-0 flex-col"
      style={{ ...shellStyle, width: "100vw", height: "100vh" }}
    >
      {settings.backgroundImagePath && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: settings.appBgColor ?? "#f1f5f9",
            opacity: Math.max(0, 1 - (settings.backgroundImageOpacity ?? 0.35)),
          }}
        />
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center justify-between px-3"
          style={{
            height: headerHeight,
            backgroundColor: settings.headerBgColor ?? "#1e293b",
            color: settings.headerTextColor ?? "#ffffff",
            cursor: largeHeaders ? "ns-resize" : undefined,
          }}
          onPointerDown={largeHeaders ? onWindowHeaderPointerDown : undefined}
          onPointerMove={largeHeaders ? onWindowHeaderPointerMove : undefined}
          onPointerUp={largeHeaders ? onWindowHeaderPointerUp : undefined}
          onPointerCancel={largeHeaders ? onWindowHeaderPointerUp : undefined}
        >
          <span className={`font-semibold ${largeHeaders ? "text-lg" : ""}`}>
            {t("appTitle")}
          </span>
          <div className="section-no-drag flex gap-1">
            <IconActionButton
              label={t("collapse")}
              onClick={toggleCollapsed}
              disabled={isAnimatingWindow}
              className="rounded bg-white/20 hover:bg-white/30"
              size={iconSize}
              tooltipPlacement="below"
            >
              <CollapseIcon className={iconClass} />
            </IconActionButton>
            <IconActionButton
              label={t("settings")}
              onClick={() => setShowSettings(true)}
              className="rounded bg-white/20 hover:bg-white/30"
              size={iconSize}
              tooltipPlacement="below"
            >
              <SettingsIcon className={iconClass} />
            </IconActionButton>
            <IconActionButton
              label={t("close")}
              onClick={handleCloseApp}
              className="rounded bg-white/20 hover:bg-white/30"
              size={iconSize}
              tooltipPlacement="below"
            >
              <CloseIcon className={iconClass} />
            </IconActionButton>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <ErrorBanner />
          <SectionCanvas
            quickActionsVisible={quickActionsVisible}
            phrasesVisible={phrasesSlotVisible}
            savedStack={settings.sectionStack}
            legacyLayouts={settings.sectionLayouts}
            onStackChange={(sectionStack) => updateSettings({ sectionStack })}
            quickActions={quickActionsVisible ? <QuickActionsBar /> : null}
            phrases={phrasesContent}
            inputRow={<InputRowPanel />}
          />
        </div>
      </div>
    </div>
  );
}
