import * as Speech from 'expo-speech';

/** Tablet-local Speak — never routes to the host PC while companion is connected. */
export function speakOnTablet(text: string, language?: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  Speech.stop();
  Speech.speak(trimmed, {
    language: language && language.length > 0 ? language : undefined,
    rate: 0.95,
  });
}

export function stopTabletSpeech(): void {
  Speech.stop();
}
