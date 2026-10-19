/** Plain set — Zustand/useSyncExternalStore ignores startTransition. */
export function commitSuggestionList(
  set: (partial: { suggestions: string[] }) => void,
  suggestions: string[],
): void {
  set({ suggestions });
}

/**
 * Suffix to type after an existing word prefix (case-folded match for
 * delete + retype), or the full word when prefix is empty.
 */
export function suggestionSuffixAfterPrefix(
  word: string,
  prefix: string,
): string | null {
  if (prefix.length === 0) return word;
  const target = prefix.toLowerCase();
  let i = 0;
  let folded = "";
  while (i < word.length && folded.length < target.length) {
    folded += word[i].toLowerCase();
    i += 1;
  }
  if (folded === target || folded.startsWith(target)) {
    return word.slice(i);
  }
  return null;
}

/** Replace the trailing whitespace-delimited token with `word`. */
export function replaceTrailingWord(
  buffer: string,
  word: string,
  trailingSpace: boolean,
): string {
  const parts = buffer.split(/\s+/);
  parts[parts.length - 1] = word;
  const next = parts.join(" ");
  return trailingSpace ? `${next} ` : next;
}
