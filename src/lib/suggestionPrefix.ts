/** Current incomplete word at the end of the typed buffer (after last whitespace). */
export function suggestionWordPrefix(typedBuffer: string): string {
  const words = typedBuffer.split(/\s+/);
  return words[words.length - 1] ?? "";
}

/** True when suggestion chips must hide (space, empty buffer, or prefix shorter than 2). */
export function shouldClearSuggestions(typedBuffer: string): boolean {
  return suggestionWordPrefix(typedBuffer).length < 2;
}
