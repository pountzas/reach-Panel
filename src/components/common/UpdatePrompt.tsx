import { useCallback, useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useTranslation } from "../../hooks/useTranslation";
import { notify } from "../../lib/notify";
import {
  getCurrentAppVersion,
  installUpdate,
  skipUpdateVersion,
  type UpdateProgress,
} from "../../lib/updater";

type PromptState = "prompt" | "downloading";

interface UpdatePromptProps {
  update: Update;
  onDismiss: () => void;
}

function formatProgress(progress: UpdateProgress): number {
  if (!progress.contentLength || progress.contentLength <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100));
}

export function UpdatePrompt({ update, onDismiss }: UpdatePromptProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<PromptState>("prompt");
  const [currentVersion, setCurrentVersion] = useState("");
  const [progress, setProgress] = useState<UpdateProgress>({
    downloaded: 0,
    contentLength: null,
  });

  useEffect(() => {
    void getCurrentAppVersion().then(setCurrentVersion);
  }, []);

  const handleInstall = useCallback(async () => {
    setState("downloading");
    try {
      await installUpdate(update, setProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(`${t("updateFailed")} ${message}`);
      setState("prompt");
      setProgress({ downloaded: 0, contentLength: null });
    }
  }, [t, update]);

  const handleSkip = useCallback(() => {
    skipUpdateVersion(update.version);
    onDismiss();
  }, [onDismiss, update.version]);

  const progressPercent = formatProgress(progress);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">{t("updateAvailable")}</h2>

        {state === "prompt" && (
          <>
            <p className="mt-2 text-sm text-slate-600">
              {t("updateVersionInfo")}{" "}
              <span className="font-medium">
                {currentVersion || "…"} → {update.version}
              </span>
            </p>
            {update.body && (
              <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {update.body}
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={onDismiss}
              >
                {t("updateLater")}
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                onClick={handleSkip}
              >
                {t("skipThisVersion")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                onClick={() => void handleInstall()}
              >
                {t("updateNow")}
              </button>
            </div>
          </>
        )}

        {state === "downloading" && (
          <div className="mt-4">
            <p className="text-sm text-slate-600">{t("updateDownloading")}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-slate-800 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {progressPercent > 0 ? `${progressPercent}%` : t("updatePreparing")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
