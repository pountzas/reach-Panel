export type TeachingPdfEntry = {
  id: string;
  title: string;
  path: string;
  lastOpenedAt: string;
}

export function sortTeachingPdfEntriesByRecent(
  entries: TeachingPdfEntry[],
): TeachingPdfEntry[] {
  return [...entries].sort((a, b) => {
    const byTime = b.lastOpenedAt.localeCompare(a.lastOpenedAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

/** Cap legacy multi-entry libraries to the single most recent document. */
export function migrateToSingleTeachingPdf(entries: TeachingPdfEntry[]): {
  entries: TeachingPdfEntry[];
  didMigrate: boolean;
} {
  if (entries.length <= 1) {
    return { entries, didMigrate: false };
  }
  const sorted = sortTeachingPdfEntriesByRecent(entries);
  return { entries: [sorted[0]], didMigrate: true };
}

export function replaceTeachingPdf(entry: TeachingPdfEntry): TeachingPdfEntry[] {
  return [entry];
}

export function clearTeachingPdf(): TeachingPdfEntry[] {
  return [];
}
