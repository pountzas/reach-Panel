import { type CSSProperties, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { logIpc } from "../../lib/logIpc";
import { notify } from "../../lib/notify";
import {
  sendDiagnosticsErrorKey,
  type DiagnosticsBundleFile,
  type SendDiagnosticsResponse,
} from "../../lib/sendDiagnostics";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SendLogsDialog } from "./SendLogsDialog";
import { SettingsSection } from "./SettingsSection";
import { ToggleRow } from "./settingsControls";
import { handleWipeProfile } from "./settingsPanelUtils";

type ToolsMaintenanceSectionProps = {
  surface: SurfaceColors;
  secondaryButtonStyle: CSSProperties;
};

export function ToolsMaintenanceSection({
  surface,
  secondaryButtonStyle,
}: ToolsMaintenanceSectionProps) {
  const { t, language } = useTranslation();
  const [logDir, setLogDir] = useState("");
  const [uploadConfigured, setUploadConfigured] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bundleFiles, setBundleFiles] = useState<DiagnosticsBundleFile[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const {
    settings,
    updateSettings,
    resetSettingsToDefaults,
    wipeActiveProfile,
    checkForUpdates,
    updateCheckStatus,
  } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      resetSettingsToDefaults: s.resetSettingsToDefaults,
      wipeActiveProfile: s.wipeActiveProfile,
      checkForUpdates: s.checkForUpdates,
      updateCheckStatus: s.updateCheckStatus,
    })),
  );

  useEffect(() => {
    void invoke<string>("cmd_get_log_dir")
      .then(setLogDir)
      .catch(logIpc("cmd_get_log_dir"));
    void invoke<boolean>("cmd_diagnostics_upload_available")
      .then(setUploadConfigured)
      .catch(logIpc("cmd_diagnostics_upload_available"));
  }, []);

  const lastSentMs = Date.parse(settings.lastAutoSendLogsAt ?? "");
  const lastSentLabel = Number.isFinite(lastSentMs)
    ? t("autoSendLogsLastSent").replace(
        "{date}",
        new Date(lastSentMs).toLocaleDateString(language),
      )
    : null;

  function closeSendDialog() {
    setDialogOpen(false);
    setNote("");
    setSending(false);
    setReportId(null);
    setSendError(null);
  }

  function openLogsFolder() {
    void invoke("cmd_open_log_dir").catch((error: unknown) => {
      logIpc("cmd_open_log_dir")(error);
      notify.error(t("openLogsFolderFailed"));
    });
  }

  return (
    <SettingsSection title={t("settingsToolsMaintenance")} surface={surface}>
      <div className="mb-4">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          style={secondaryButtonStyle}
          disabled={updateCheckStatus === "checking"}
          onClick={() => {
            void (async () => {
              await checkForUpdates();
              const status = useAppStore.getState().updateCheckStatus;
              if (status === "upToDate") {
                notify.success(t("updateUpToDate"));
              } else if (status === "error") {
                const detail = useAppStore.getState().updateCheckError;
                notify.error(
                  detail
                    ? `${t("updateCheckFailed")} ${detail}`
                    : t("updateCheckFailed"),
                );
              }
            })();
          }}>
          {updateCheckStatus === "checking"
            ? t("updatePreparing")
            : t("checkForUpdates")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          style={secondaryButtonStyle}
          onClick={openLogsFolder}>
          {t("openLogsFolder")}
        </button>
        {uploadConfigured ? (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            style={secondaryButtonStyle}
            onClick={() => {
              setNote("");
              setReportId(null);
              setSendError(null);
              setDialogOpen(true);
              void invoke<SendDiagnosticsResponse>("cmd_send_diagnostics", {
                send: false,
              })
                .then((result) => {
                  setBundleFiles(result.files);
                })
                .catch((error: unknown) => {
                  logIpc("cmd_send_diagnostics")(error);
                  setSendError(t(sendDiagnosticsErrorKey(error)));
                });
            }}>
            {t("sendLogs")}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          style={secondaryButtonStyle}
          onClick={() => {
            void (async () => {
              try {
                const report = await invoke<string>("cmd_collect_diagnostics");
                await navigator.clipboard.writeText(report);
                notify.success(t("diagnosticsCopied"));
              } catch (error) {
                logIpc("cmd_collect_diagnostics")(error);
                notify.error(t("copyDiagnosticsFailed"));
              }
            })();
          }}>
          {t("copyDiagnostics")}
        </button>
      </div>
      {logDir ? (
        <p className="mb-4 text-xs" style={{ color: surface.panelMutedText }}>
          {logDir}
        </p>
      ) : null}

      {uploadConfigured ? (
        <div className="mb-4">
          <ToggleRow
            label={t("autoSendLogsWeekly")}
            checked={settings.autoSendLogsWeekly === true}
            onChange={(checked) => {
              void updateSettings({ autoSendLogsWeekly: checked });
            }}
            surface={surface}
          />
          <p
            className="mt-1 px-1 text-xs"
            style={{ color: surface.panelMutedText }}>
            {t("autoSendLogsWeeklyDescription")}
          </p>
          <p
            className="mt-1 px-1 text-xs"
            style={{ color: surface.panelMutedText }}>
            {t("sendLogsDestination")}
          </p>
          {lastSentLabel ? (
            <p
              className="mt-1 px-1 text-xs"
              style={{ color: surface.panelMutedText }}>
              {lastSentLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
        style={{ backgroundColor: surface.insetBg }}
        onClick={() => void resetSettingsToDefaults()}>
        {t("resetUi")}
      </button>
      <p className="mt-1 text-xs" style={{ color: surface.panelMutedText }}>
        {t("resetUiHint")}
      </p>
      <button
        type="button"
        className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
        style={{ backgroundColor: surface.insetBg }}
        onClick={() => void handleWipeProfile(wipeActiveProfile, t)}>
        {t("wipeProfile")}
      </button>
      <p className="mt-1 text-xs" style={{ color: surface.panelMutedText }}>
        {t("wipeProfileHint")}
      </p>
      <SendLogsDialog
        cancelLabel={t("cancel")}
        copyIdLabel={t("sendLogsCopyId")}
        destination={t("sendLogsDestination")}
        errorMessage={sendError}
        files={bundleFiles}
        note={note}
        noteHint={t("sendLogsNoteHint")}
        noteLabel={t("sendLogsNoteLabel")}
        onCancel={closeSendDialog}
        onCopyId={() => {
          if (!reportId) return;
          void navigator.clipboard.writeText(reportId).then(
            () => {
              notify.success(t("sendLogsReportCopied"));
            },
            (error: unknown) => {
              logIpc("cmd_send_diagnostics")(error);
              notify.error(t("copyDiagnosticsFailed"));
            },
          );
        }}
        onNoteChange={setNote}
        onOpenLogs={openLogsFolder}
        onSend={() => {
          void (async () => {
            setSending(true);
            setSendError(null);
            try {
              const result = await invoke<SendDiagnosticsResponse>(
                "cmd_send_diagnostics",
                { send: true, note: note.trim() ? note.trim() : null },
              );
              setReportId(result.reportId ?? null);
            } catch (error) {
              logIpc("cmd_send_diagnostics")(error);
              setSendError(t(sendDiagnosticsErrorKey(error)));
            } finally {
              setSending(false);
            }
          })();
        }}
        open={dialogOpen}
        openLogsLabel={t("openLogsFolder")}
        privacyTyped={t("sendLogsPrivacyTyped")}
        privacyUsername={t("sendLogsPrivacyUsername")}
        reportId={reportId}
        sendLabel={t("sendLogsSend")}
        sending={sending}
        sendingLabel={t("sendLogsSending")}
        successTitle={t("sendLogsSuccessTitle")}
        surface={surface}
        title={t("sendLogsConsentTitle")}
      />
    </SettingsSection>
  );
}
