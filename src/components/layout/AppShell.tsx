import { type CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { KeyboardSection } from "../keyboard/KeyboardSection";
import { MousePanel } from "../mouse/MousePanel";
import { QuickActionsBar } from "../quick-actions/QuickActionsBar";
import { PhrasePanel } from "../phrases/PhrasePanel";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { ErrorBanner } from "../common/ErrorBanner";
import { UpdatePrompt } from "../common/UpdatePrompt";
import { SettingsPanel } from "../settings/SettingsPanel";
import { MacroBuilder } from "../macros/MacroBuilder";
import { HeadTrackingWizard } from "../head-tracking/HeadTrackingWizard";
import { SectionCanvas } from "./SectionCanvas";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

function InputRowPanel() {
  const { settings, updateSettings } = useAppStore();
  const rightRatio = settings.inputRowRightRatio ?? 0.28;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {settings.suggestionsVisible && (
        <div className="shrink-0">
          <SuggestionsBar />
        </div>
      )}
      {settings.mouseVisible ? (
        <ResizableSplitPane
          rightRatio={rightRatio}
          onRightRatioChange={(inputRowRightRatio) =>
            updateSettings({ inputRowRightRatio })
          }
          left={<KeyboardSection />}
          right={<MousePanel />}
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
        <button
          type="button"
          className="rounded-lg bg-white/20 px-4 py-2 disabled:opacity-50"
          onClick={toggleCollapsed}
          disabled={isAnimatingWindow}
        >
          {t("expand")}
        </button>
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
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded px-3 py-1 text-sm bg-white/20 disabled:opacity-50"
              onClick={toggleCollapsed}
              disabled={isAnimatingWindow}
            >
              {t("collapse")}
            </button>
            <button
              type="button"
              className="rounded px-3 py-1 text-sm bg-white/20"
              onClick={() => setShowSettings(true)}
            >
              {t("settings")}
            </button>
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
