const SPEECH_PRIVACY_PREFIX = "SPEECH_PRIVACY:";

/** True when the error should stay as the sticky privacy banner (not a toast). */
export function isSpeechPrivacyError(error: string | null | undefined): boolean {
  if (!error) return false;
  if (error.startsWith(SPEECH_PRIVACY_PREFIX)) return true;
  const lower = error.toLowerCase();
  return (
    lower.includes("0x80045509") || lower.includes("speech privacy policy")
  );
}

/** Human-readable portion after the SPEECH_PRIVACY: prefix, if present. */
export function speechPrivacyMessage(error: string): string {
  if (error.startsWith(SPEECH_PRIVACY_PREFIX)) {
    return error.slice(SPEECH_PRIVACY_PREFIX.length).trim();
  }
  return error;
}

export const SPEECH_PRIVACY_SETTINGS_URI = "ms-settings:privacy-speech";
