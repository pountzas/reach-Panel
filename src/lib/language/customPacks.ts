import type { LanguageAgeBand, LanguagePack, LessonLanguage } from "./types";

export const MAX_CUSTOM_WORDS = 500;
export const MAX_WORD_CHARS = 512;

export function isCaregiverLanguagePack(pack: LanguagePack): boolean {
  return pack.source === "caregiver" || pack.id.startsWith("caregiver-");
}

export function parseWordListLines(text: string): string[] {
  const words: string[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    words.push(line.slice(0, MAX_WORD_CHARS));
    if (words.length >= MAX_CUSTOM_WORDS) break;
  }
  return words;
}

export function listCustomPacksForLanguage(
  packs: LanguagePack[],
  lessonLanguage: LessonLanguage,
): LanguagePack[] {
  return packs.filter(
    (pack) =>
      isCaregiverLanguagePack(pack) && pack.lessonLanguage === lessonLanguage,
  );
}

export function createCaregiverPack(options: {
  title: string;
  words: string[];
  lessonLanguage: LessonLanguage;
  ageBand: LanguageAgeBand;
}): LanguagePack | null {
  const words = options.words
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .slice(0, MAX_CUSTOM_WORDS);
  if (words.length === 0) return null;

  const title = options.title.trim() || "My list";
  return {
    id: `caregiver-${crypto.randomUUID()}`,
    title,
    lessonLanguage: options.lessonLanguage,
    ageBand: options.ageBand,
    source: "caregiver",
    tasks: words.map((answer) => ({ type: "spell" as const, answer })),
  };
}
