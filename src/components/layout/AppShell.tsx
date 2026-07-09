import { type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { KeyboardSection } from "../keyboard/KeyboardSection";
import { MousePanel } from "../mouse/MousePanel";
import { MOUSE_PANEL_MIN_WIDTH } from "../../lib/mousePanelLayout";
import { QuickActionsBar } from "../quick-actions/QuickActionsBar";
import { PhrasePanel } from "../phrases/PhrasePanel";
import { ErrorBanner } from "../common/ErrorBanner";
import { UpdatePrompt } from "../common/UpdatePrompt";
import { SettingsPanel } from "../settings/SettingsPanel";
import { MacroBuilder } from "../macros/MacroBuilder";
import { HeadTrackingWizard } from "../head-tracking/HeadTrackingWizard";
import { SectionCanvas } from "./SectionCanvas";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { CollapseIcon, ExpandIcon, SettingsIcon } from "../common/SectionIcons";
import { IconActionButton } from "../common/IconActionButton";

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

export function AppShell() {
  const {
    settings,
    showSettings,
    showMacroBuilder,
    showHeadTrackingWizard,
    pendingUpdate,
    setPendingUpdate,
    setShowSettings,
    toggleCollapsed,
    updateSettings,
    isAnimatingWindow,
  } = useAppStore();
  const { t } = useTranslation();

  if (settings.collapsed) {
    return (
      <div
        className="flex items-center justify-between px-4"
        style={{
          width: "100vw",
          height: "100vh",
          backgroundColor: settings.headerBgColor ?? "#1e293b",
          color: settings.headerTextColor ?? "#ffffff",
        }}
      >
        <span className="font-semibold">{t("appTitle")}</span>
        <IconActionButton
          label={t("expand")}
          onClick={toggleCollapsed}
          disabled={isAnimatingWindow}
          className="h-8 w-8 rounded-lg bg-white/20 hover:bg-white/30"
        >
          <ExpandIcon />
        </IconActionButton>
      </div>
    );
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
          className="flex shrink-0 items-center justify-between px-3 py-2"
          style={{
            backgroundColor: settings.headerBgColor ?? "#1e293b",
            color: settings.headerTextColor ?? "#ffffff",
          }}
        >
          <span className="font-semibold">{t("appTitle")}</span>
          <div className="flex gap-1">
            <IconActionButton
              label={t("collapse")}
              onClick={toggleCollapsed}
              disabled={isAnimatingWindow}
              className="rounded bg-white/20 hover:bg-white/30"
            >
              <CollapseIcon />
            </IconActionButton>
            <IconActionButton
              label={t("settings")}
              onClick={() => setShowSettings(true)}
              className="rounded bg-white/20 hover:bg-white/30"
            >
              <SettingsIcon />
            </IconActionButton>
          </div>
        </header>

        <ErrorBanner />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <SectionCanvas
            quickActionsVisible={settings.quickActionsVisible}
            phrasesVisible={settings.phrasesVisible}
            savedLayouts={settings.sectionLayouts}
            onLayoutsChange={(sectionLayouts) => updateSettings({ sectionLayouts })}
            quickActions={<QuickActionsBar />}
            phrases={<PhrasePanel />}
            inputRow={<InputRowPanel />}
          />
        </div>

        {showSettings && <SettingsPanel />}
        {showMacroBuilder && <MacroBuilder />}
        {showHeadTrackingWizard && <HeadTrackingWizard />}
        {pendingUpdate && (
          <UpdatePrompt
            update={pendingUpdate}
            onDismiss={() => setPendingUpdate(null)}
          />
        )}
      </div>
    </div>
  );
}
