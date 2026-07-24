import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

const SPEECH_PRIVACY_PREFIX = "SPEECH_PRIVACY:";
const SPEECH_SETTINGS_URI = "ms-settings:privacy-speech";

function parseError(lastError: string): {
  message: string;
  isSpeechPrivacy: boolean;
} {
  if (lastError.startsWith(SPEECH_PRIVACY_PREFIX)) {
    return {
      message: lastError.slice(SPEECH_PRIVACY_PREFIX.length).trim(),
      isSpeechPrivacy: true,
    };
  }
  const lower = lastError.toLowerCase();
  if (
    lower.includes("0x80045509") ||
    lower.includes("speech privacy policy")
  ) {
    return { message: lastError, isSpeechPrivacy: true };
  }
  return { message: lastError, isSpeechPrivacy: false };
}

export function ErrorBanner() {
  const { lastError, setLastError } = useAppStore();
  const { t } = useTranslation();
  if (!lastError) return null;

  const { message, isSpeechPrivacy } = parseError(lastError);

  const openSpeechSettings = async () => {
    try {
      await invoke("cmd_open_windows_settings", { uri: SPEECH_SETTINGS_URI });
    } catch (error) {
      setLastError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-red-100 px-3 py-2 text-sm text-red-800">
      <span>
        {t("inputError")} {isSpeechPrivacy ? t("dictationErrorSpeechPrivacy") : message}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {isSpeechPrivacy && (
          <button
            type="button"
            className="rounded bg-red-700 px-2 py-0.5 font-semibold text-white"
            onClick={() => void openSpeechSettings()}
          >
            {t("dictationOpenSpeechSettings")}
          </button>
        )}
        <button type="button" className="font-bold" onClick={() => setLastError(null)}>
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}
