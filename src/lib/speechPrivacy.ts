const SPEECH_PRIVACY_PREFIX = "SPEECH_PRIVACY:";
const SPEECH_LANGUAGE_PREFIX = "SPEECH_LANGUAGE:";
const WHISPER_MODEL_PREFIX = "WHISPER_MODEL:";
const WHISPER_UNSUPPORTED_PREFIX = "WHISPER_UNSUPPORTED:";

export type SpeechErrorKind =
  | "privacy"
  | "language"
  | "whisperModel"
  | "winrtUnsupported"
  | null;

/** Privacy toggle for online speech recognition. */
export const SPEECH_PRIVACY_SETTINGS_URI = "ms-settings:privacy-speech";
/** Time & language → Speech — add recognition / TTS language packs. */
export const SPEECH_LANGUAGE_SETTINGS_URI = "ms-settings:speech";

export function parseSpeechError(lastError: string): {
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

/**
 * True when the error should stay as the sticky overlay banner (not a toast).
 * Covers actionable speech setup errors that need CTAs.
 */
export function isStickySpeechError(error: string | null | undefined): boolean {
  if (!error) return false;
  return parseSpeechError(error).kind !== null;
}

/** @deprecated Prefer isStickySpeechError — privacy is one of several sticky kinds. */
export function isSpeechPrivacyError(error: string | null | undefined): boolean {
  if (!error) return false;
  return parseSpeechError(error).kind === "privacy";
}

/** Human-readable portion after a known prefix, if present. */
export function speechPrivacyMessage(error: string): string {
  return parseSpeechError(error).message;
}
