import type { CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Keyboard } from "../keyboard/Keyboard";
import { MousePanel } from "../mouse/MousePanel";
import { QuickActionsBar } from "../quick-actions/QuickActionsBar";
import { PhrasePanel } from "../phrases/PhrasePanel";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { ErrorBanner } from "../common/ErrorBanner";
import { SettingsPanel } from "../settings/SettingsPanel";
import { MacroBuilder } from "../macros/MacroBuilder";
import { HeadTrackingWizard } from "../head-tracking/HeadTrackingWizard";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

export function AppShell() {
  const {
    settings,
    showSettings,
    showMacroBuilder,
    showHeadTrackingWizard,
    setShowSettings,
    toggleCollapsed,
  } = useAppStore();
  const { t } = useTranslation();

  if (settings.collapsed) {
    return (
      <div
        className="flex h-screen items-center justify-between px-4"
        style={{
          backgroundColor: settings.headerBgColor ?? "#1e293b",
          color: settings.headerTextColor ?? "#ffffff",
        }}
      >
        <span className="font-semibold">{t("appTitle")}</span>
        <button
          type="button"
          className="rounded-lg bg-white/20 px-4 py-2"
          onClick={toggleCollapsed}
        >
          {t("expand")}
        </button>
      </div>
    );
  }

  const showMouse = settings.mouseVisible;
  const mousePanel = showMouse ? <MousePanel /> : null;
  const keyboardPanel = (
    <div className="min-w-0 flex-1">
      <Keyboard />
    </div>
  );

  const shellStyle: CSSProperties = {
    backgroundColor: settings.appBgColor ?? "#f1f5f9",
  };

  if (settings.backgroundImagePath) {
    shellStyle.backgroundImage = `url("${convertFileSrc(settings.backgroundImagePath)}")`;
    shellStyle.backgroundSize = "cover";
    shellStyle.backgroundPosition = "center";
    shellStyle.backgroundRepeat = "no-repeat";
  }

  const inputRow = (
    <div className="flex shrink-0 items-stretch gap-2">
      {showMouse && settings.mouseSide === "left" && mousePanel}
      {keyboardPanel}
      {showMouse && settings.mouseSide === "right" && mousePanel}
    </div>
  );

  return (
    <div className="relative flex h-screen flex-col" style={shellStyle}>
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
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            backgroundColor: settings.headerBgColor ?? "#1e293b",
            color: settings.headerTextColor ?? "#ffffff",
          }}
        >
          <span className="font-semibold">{t("appTitle")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded px-3 py-1 text-sm bg-white/20"
              onClick={toggleCollapsed}
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
        </div>

        <ErrorBanner />
        {settings.quickActionsVisible && <QuickActionsBar />}

        <div className="flex min-h-0 flex-1 flex-col p-2">
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {settings.phrasesVisible && <PhrasePanel />}
              <div className="rounded-xl border border-slate-200 bg-white/90 p-2 text-xs text-slate-500">
                {t("validationHint")}
              </div>
            </div>
          </div>

          <div className="mt-auto shrink-0 space-y-2 pt-2">
            {settings.suggestionsVisible && <SuggestionsBar />}
            {inputRow}
          </div>
        </div>

        {showMouse && settings.mouseSide === "floating" && (
          <div className="fixed bottom-4 right-4 z-40 h-64 w-72 shadow-2xl">
            <MousePanel />
          </div>
        )}

        {showSettings && <SettingsPanel />}
        {showMacroBuilder && <MacroBuilder />}
        {showHeadTrackingWizard && <HeadTrackingWizard />}
      </div>
    </div>
  );
}
