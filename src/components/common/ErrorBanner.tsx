import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

const SPEECH_PRIVACY_PREFIX = "SPEECH_PRIVACY:";
const SPEECH_LANGUAGE_PREFIX = "SPEECH_LANGUAGE:";
const WHISPER_MODEL_PREFIX = "WHISPER_MODEL:";
const WHISPER_UNSUPPORTED_PREFIX = "WHISPER_UNSUPPORTED:";
/** Privacy toggle for online speech recognition. */
const SPEECH_PRIVACY_SETTINGS_URI = "ms-settings:privacy-speech";
/** Time & language → Speech — add recognition / TTS language packs. */
const SPEECH_LANGUAGE_SETTINGS_URI = "ms-settings:speech";

type SpeechErrorKind =
  | "privacy"
  | "language"
  | "whisperModel"
  | "winrtUnsupported"
  | null;

function parseError(lastError: string): {
  message: string;
  kind: SpeechErrorKind;
} {
  if (lastError.startsWith(SPEECH_PRIVACY_PREFIX)) {
    return {
      message: lastError.slice(SPEECH_PRIVACY_PREFIX.length).trim(),
      kind: "privacy",
    };
  }
  if (lastError.startsWith(SPEECH_LANGUAGE_PREFIX)) {
    return {
      message: lastError.slice(SPEECH_LANGUAGE_PREFIX.length).trim(),
      kind: "language",
    };
  }
  if (lastError.startsWith(WHISPER_MODEL_PREFIX)) {
    return {
      message: lastError.slice(WHISPER_MODEL_PREFIX.length).trim(),
      kind: "whisperModel",
    };
  }
  if (lastError.startsWith(WHISPER_UNSUPPORTED_PREFIX)) {
    return {
      message: lastError.slice(WHISPER_UNSUPPORTED_PREFIX.length).trim(),
      kind: "winrtUnsupported",
    };
  }
  const lower = lastError.toLowerCase();
  if (
    lower.includes("0x80045509") ||
    lower.includes("speech privacy policy")
  ) {
    return { message: lastError, kind: "privacy" };
  }
  if (
    lower.includes("no speech recognition language") ||
    lower.includes("speech pack")
  ) {
    return { message: lastError, kind: "language" };
  }
  if (lower.includes("local speech model") || lower.includes("whisper")) {
    return { message: lastError, kind: "whisperModel" };
  }
  return { message: lastError, kind: null };
}

export function ErrorBanner() {
  const { lastError, setLastError, ensureWhisperModel, sttCapability } =
    useAppStore();
  const { t } = useTranslation();
  if (!lastError) return null;

  const { message, kind } = parseError(lastError);

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
      setLastError(error instanceof Error ? error.message : String(error));
    }
  };

  const downloading = sttCapability?.whisperDownloading ?? false;

  return (
    <div className="flex items-center justify-between gap-3 bg-red-100 px-3 py-2 text-sm text-red-800">
      <span>
        {t("inputError")} {displayMessage}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {kind === "privacy" && (
          <button
            type="button"
            className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
            onClick={() => void openSettings(SPEECH_PRIVACY_SETTINGS_URI)}
          >
            {t("dictationOpenSpeechSettings")}
          </button>
        )}
        {kind === "language" && (
          <button
            type="button"
            className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
            onClick={() => void openSettings(SPEECH_LANGUAGE_SETTINGS_URI)}
          >
            {t("dictationOpenSpeechLanguageSettings")}
          </button>
        )}
        {(kind === "whisperModel" || kind === "winrtUnsupported") && (
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
        <button type="button" className="font-bold" onClick={() => setLastError(null)}>
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
