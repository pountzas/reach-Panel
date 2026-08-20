import { BUILT_IN_LANGUAGE_PACKS } from "./builtInPacks";
import type { LanguageAgeBand, LanguagePack, LessonLanguage } from "./types";
import { DEFAULT_LANGUAGE_AGE_BAND } from "./types";

export function filterPacksByBand(
  packs: LanguagePack[],
  band: LanguageAgeBand,
): LanguagePack[] {
  return packs.filter((pack) => pack.ageBand === band);
}

export function getLanguagePackById(
  id: string | null | undefined,
  extra: LanguagePack[] = [],
): LanguagePack | null {
  if (!id) return null;
  const all = [...BUILT_IN_LANGUAGE_PACKS, ...extra];
  return all.find((pack) => pack.id === id) ?? null;
}

export function listBuiltInPacksForBand(band: LanguageAgeBand): LanguagePack[] {
  return filterPacksByBand(BUILT_IN_LANGUAGE_PACKS, band);
}

export function listBuiltInPacksForBandAndLanguage(
  band: LanguageAgeBand,
  lessonLanguage: LessonLanguage,
): LanguagePack[] {
  return listBuiltInPacksForBand(band).filter(
    (pack) => pack.lessonLanguage === lessonLanguage,
  );
}

export function defaultLanguagePackId(
  band: LanguageAgeBand = DEFAULT_LANGUAGE_AGE_BAND,
  preferredLanguage?: LessonLanguage,
): string {
  const packs = listBuiltInPacksForBand(band);
  if (preferredLanguage) {
    const match = packs.find((pack) => pack.lessonLanguage === preferredLanguage);
    if (match) return match.id;
  }
  const fallback = listBuiltInPacksForBand(DEFAULT_LANGUAGE_AGE_BAND);
  return (
    packs[0]?.id ??
    fallback[0]?.id ??
    BUILT_IN_LANGUAGE_PACKS[0]!.id
  );
}

export function isSpellTask(
  task: LanguagePack["tasks"][number],
): task is Extract<LanguagePack["tasks"][number], { type: "spell" }> {
  return task.type === "spell";
}

export function currentSpellAnswer(
  pack: LanguagePack | null,
  taskIndex: number,
): string | null {
  if (!pack) return null;
  const task = pack.tasks[taskIndex];
  if (!task || task.type !== "spell") return null;
  return task.answer;
}
