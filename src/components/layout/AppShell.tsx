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
import { AppToaster } from "../common/AppToaster";
import { ErrorBanner } from "../common/ErrorBanner";
import { UpdatePrompt } from "../common/UpdatePrompt";
import { SectionCanvas } from "./SectionCanvas";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { CollapseIcon, CloseIcon, SettingsIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";
import { CollapsedFab } from "./CollapsedFab";
import {
  appHeaderHeightPx,
  clampWindowHeightRatio,
  computeContentHeightRatio,
} from "../../lib/sectionLayouts";
import { closeAllToolWindows } from "../../lib/toolWindows";

function InputRowPanel() {
  const { settings, updateSettings } = useAppStore();
  const mouseSide = settings.mousePanelSide ?? "right";
  const mouseRatio = settings.inputRowRightRatio ?? 0.28;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {settings.mouseVisible ? (
        <ResizableSplitPane
          ratioSide={mouseSide === "left" ? "left" : "right"}
          rightRatio={mouseRatio}
          onRightRatioChange={(inputRowRightRatio) =>
            updateSettings({ inputRowRightRatio })
          }
          minLeftWidth={mouseSide === "left" ? MOUSE_PANEL_MIN_WIDTH : 160}
          minRightWidth={mouseSide === "left" ? 160 : MOUSE_PANEL_MIN_WIDTH}
          left={mouseSide === "left" ? <MousePanel /> : <KeyboardSection />}
          right={mouseSide === "left" ? <KeyboardSection /> : <MousePanel />}
        />
      ) : (
        <div className="min-h-0 flex-1">
          <KeyboardSection />
        </div>
      )}
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

function contentHeightRatioFromSettings(settings: {
  quickActionsVisible: boolean;
  phrasesVisible: boolean;
  windowHeightRatio?: number;
}): number {
  const contentRatio = computeContentHeightRatio({
    quickActions: settings.quickActionsVisible,
    phrases: settings.phrasesVisible,
  });
  if (settings.windowHeightRatio == null) return contentRatio;
  return Math.max(contentRatio, clampWindowHeightRatio(settings.windowHeightRatio));
}

export function AppShell() {
  const {
    settings,
    monitors,
    pendingUpdate,
    setPendingUpdate,
    setShowSettings,
    toggleCollapsed,
    updateSettings,
    applyWindowHeightRatioLive,
    isAnimatingWindow,
    musicTeachingEnabled,
  } = useAppStore();
  const { t } = useTranslation();
  const largeHeaders = settings.largeHeaders;
  const headerHeight = appHeaderHeightPx(largeHeaders);
  const iconSize = largeHeaders ? "lg" : "sm";
  const iconClass = largeHeaders ? "h-7 w-7" : "h-4 w-4";
  const showMusicLesson =
    musicTeachingEnabled && settings.keyboardSectionMode === "synthesizer";
  const phrasesSlotVisible = settings.phrasesVisible || showMusicLesson;
  const windowResizeRef = useRef<{
    startY: number;
    startRatio: number;
    regionHeight: number;
    latestRatio: number;
  } | null>(null);

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
    const startRatio = contentHeightRatioFromSettings(settings);
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
    void applyWindowHeightRatioLive(nextRatio);
  };

  const onWindowHeaderPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = windowResizeRef.current;
    if (!drag) return;
    windowResizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    void updateSettings({ windowHeightRatio: drag.latestRatio });
  };

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
            >
              <CollapseIcon className={iconClass} />
            </IconActionButton>
            <IconActionButton
              label={t("settings")}
              onClick={() => setShowSettings(true)}
              className="rounded bg-white/20 hover:bg-white/30"
              size={iconSize}
            >
              <SettingsIcon className={iconClass} />
            </IconActionButton>
            <IconActionButton
              label={t("close")}
              onClick={handleCloseApp}
              className="rounded bg-white/20 hover:bg-white/30"
              size={iconSize}
            >
              <CloseIcon className={iconClass} />
            </IconActionButton>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <ErrorBanner />
          <SectionCanvas
            quickActionsVisible={settings.quickActionsVisible}
            phrasesVisible={phrasesSlotVisible}
            savedLayouts={settings.sectionLayouts}
            onLayoutsChange={(sectionLayouts) => updateSettings({ sectionLayouts })}
            quickActions={<QuickActionsBar />}
            phrases={showMusicLesson ? <MusicLessonPanel /> : <PhrasePanel />}
            inputRow={<InputRowPanel />}
          />
        </div>

        {pendingUpdate && (
          <UpdatePrompt
            update={pendingUpdate}
            onDismiss={() => setPendingUpdate(null)}
          />
        )}
        <AppToaster />
      </div>
    </div>
  );
}
