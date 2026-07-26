import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { notify } from "../../lib/notify";
import {
  isSpeechPrivacyError,
  SPEECH_PRIVACY_SETTINGS_URI,
} from "../../lib/speechPrivacy";

/**
 * Sticky overlay for speech-privacy errors only.
 * All other errors are routed to toasts via the store / callers.
 */
export function ErrorBanner() {
  const { lastError, setLastError } = useAppStore();
  const { t } = useTranslation();

  if (!lastError || !isSpeechPrivacyError(lastError)) {
    return null;
  }

  const openSpeechSettings = async () => {
    try {
      await invoke("cmd_open_windows_settings", {
        uri: SPEECH_PRIVACY_SETTINGS_URI,
      });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-2"
      role="alert"
    >
      <div className="pointer-events-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm text-red-800 shadow-md">
        <span>
          {t("inputError")} {t("dictationErrorSpeechPrivacy")}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
            onClick={() => void openSpeechSettings()}
          >
            {t("dictationOpenSpeechSettings")}
          </button>
          <button
            type="button"
            className="font-bold"
            onClick={() => setLastError(null)}
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
