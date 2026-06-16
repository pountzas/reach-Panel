import type { CSSProperties } from "react";
import { Group, Panel } from "react-resizable-panels";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MousePanel } from "../mouse/MousePanel";
import { QuickActionsBar } from "../quick-actions/QuickActionsBar";
import { PhrasePanel } from "../phrases/PhrasePanel";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { ErrorBanner } from "../common/ErrorBanner";
import { SettingsPanel } from "../settings/SettingsPanel";
import { MacroBuilder } from "../macros/MacroBuilder";
import { HeadTrackingWizard } from "../head-tracking/HeadTrackingWizard";
import { Keyboard } from "../keyboard/Keyboard";
import { LayoutResizeProvider, SectionPanel } from "./SectionPanel";
import { SectionResizeHandle } from "./SectionResizeHandle";
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

        <LayoutResizeProvider>
          <Group orientation="vertical" className="flex min-h-0 flex-1 flex-col p-2">
            {settings.quickActionsVisible && (
              <>
                <Panel defaultSize={12} minSize={6} id="quick-actions">
                  <SectionPanel>
                    <QuickActionsBar />
                  </SectionPanel>
                </Panel>
                <SectionResizeHandle />
              </>
            )}

            {settings.phrasesVisible && (
              <>
                <Panel defaultSize={40} minSize={15} id="phrases">
                  <SectionPanel>
                    <PhrasePanel />
                  </SectionPanel>
                </Panel>
                <SectionResizeHandle />
              </>
            )}

            <Panel defaultSize={48} minSize={25} id="input-area">
              <Group orientation="vertical" className="flex h-full flex-col">
                {settings.suggestionsVisible && (
                  <>
                    <Panel defaultSize={15} minSize={8} id="suggestions">
                      <SectionPanel>
                        <SuggestionsBar />
                      </SectionPanel>
                    </Panel>
                    <SectionResizeHandle />
                  </>
                )}
                <Panel defaultSize={85} minSize={40} id="keyboard-mouse">
                  <SectionPanel className="pt-0">
                    <div className="flex h-full items-stretch gap-2 pt-6">
                      {showMouse && settings.mouseSide === "left" && mousePanel}
                      {keyboardPanel}
                      {showMouse && settings.mouseSide === "right" && mousePanel}
                    </div>
                  </SectionPanel>
                </Panel>
              </Group>
            </Panel>
          </Group>
        </LayoutResizeProvider>

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
