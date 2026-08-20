export const TEACHING_PDF_LIBRARY_CAP = 20;

export type TeachingPdfEntry = {
  id: string;
  title: string;
  path: string;
  lastOpenedAt: string;
};

export function sortTeachingPdfEntriesByRecent(
  entries: TeachingPdfEntry[],
): TeachingPdfEntry[] {
  return [...entries].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export function upsertTeachingPdfEntry(
  entries: TeachingPdfEntry[],
  entry: TeachingPdfEntry,
): TeachingPdfEntry[] {
  const without = entries.filter((e) => e.id !== entry.id && e.path !== entry.path);
  const next = [...without, entry];
  return sortTeachingPdfEntriesByRecent(next).slice(0, TEACHING_PDF_LIBRARY_CAP);
}

export function removeTeachingPdfEntry(
  entries: TeachingPdfEntry[],
  id: string,
): TeachingPdfEntry[] {
  return entries.filter((e) => e.id !== id);
}
