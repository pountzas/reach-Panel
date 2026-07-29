import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { notify } from "../../lib/notify";
import {
  isStickySpeechError,
  parseSpeechError,
  SPEECH_LANGUAGE_SETTINGS_URI,
  SPEECH_PRIVACY_SETTINGS_URI,
  type SpeechErrorKind,
} from "../../lib/speechPrivacy";

/**
 * Sticky overlay for actionable speech/setup errors (privacy, language pack,
 * Whisper model). All other errors are routed to toasts via the store.
 */
export function ErrorBanner() {
  const { lastError, setLastError, ensureWhisperModel, sttCapability } =
    useAppStore();
  const { t } = useTranslation();

  if (!lastError || !isStickySpeechError(lastError)) {
    return null;
  }

  const { message, kind } = parseSpeechError(lastError);

  let displayMessage = message;
  switch (kind) {
    case "privacy":
      displayMessage = t("dictationErrorSpeechPrivacy");
      break;
    case "language":
      displayMessage = t("dictationErrorNoLanguage");
      break;
    case "whisperModel":
      displayMessage = t("dictationErrorWhisperModel");
      break;
    case "winrtUnsupported":
      displayMessage = t("dictationErrorWinrtUnsupported");
      break;
    case null:
      break;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      break;
    }
  }

  const openSettings = async (uri: string) => {
    try {
      await invoke("cmd_open_windows_settings", { uri });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : String(error));
    }
  };

  const downloading = sttCapability?.whisperDownloading ?? false;
  const kindForActions: SpeechErrorKind = kind;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-2"
      role="alert"
    >
      <div className="pointer-events-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm text-red-800 shadow-md">
        <span>
          {t("inputError")} {displayMessage}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {kindForActions === "privacy" && (
            <button
              type="button"
              className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
              onClick={() => void openSettings(SPEECH_PRIVACY_SETTINGS_URI)}
            >
              {t("dictationOpenSpeechSettings")}
            </button>
          )}
          {kindForActions === "language" && (
            <button
              type="button"
              className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
              onClick={() => void openSettings(SPEECH_LANGUAGE_SETTINGS_URI)}
            >
              {t("dictationOpenSpeechLanguageSettings")}
            </button>
          )}
          {(kindForActions === "whisperModel" ||
            kindForActions === "winrtUnsupported") && (
            <button
              type="button"
              className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white disabled:opacity-60"
              disabled={downloading}
              onClick={() => void ensureWhisperModel()}
            >
              {downloading
                ? t("dictationDownloadingModel")
                : t("dictationDownloadModel")}
            </button>
          )}
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
