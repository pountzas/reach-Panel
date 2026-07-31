const SPEECH_PRIVACY_PREFIX = "SPEECH_PRIVACY:";
const SPEECH_LANGUAGE_PREFIX = "SPEECH_LANGUAGE:";
const GROQ_KEY_PREFIX = "GROQ_KEY:";
const GROQ_API_PREFIX = "GROQ_API:";

export type SpeechErrorKind =
  | "privacy"
  | "language"
  | "groqKey"
  | "groqApi"
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
  if (lastError.startsWith(GROQ_KEY_PREFIX)) {
    return {
      message: lastError.slice(GROQ_KEY_PREFIX.length).trim(),
      kind: "groqKey",
    };
  }
  if (lastError.startsWith(GROQ_API_PREFIX)) {
    return {
      message: lastError.slice(GROQ_API_PREFIX.length).trim(),
      kind: "groqApi",
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
  if (lower.includes("groq api key") || lower.includes("groq key")) {
    return { message: lastError, kind: "groqKey" };
  }
  return { message: lastError, kind: null };
}

/**
 * True when the error should stay as the sticky overlay banner (not a toast).
 * Covers actionable speech setup errors that need CTAs.
 */
export function isStickySpeechError(error: string | null | undefined): boolean {
  if (!error) return false;
  const kind = parseSpeechError(error).kind;
  return kind === "privacy" || kind === "language" || kind === "groqKey";
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
