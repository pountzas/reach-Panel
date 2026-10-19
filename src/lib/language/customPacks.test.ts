import { describe, expect, it } from "vitest";
import {
  createCaregiverPack,
  isCaregiverLanguagePack,
  listCustomPacksForLanguage,
  parseWordListLines,
} from "./customPacks";

describe("parseWordListLines", () => {
  it("keeps one word per line and skips blanks and comments", () => {
    expect(parseWordListLines("γάτα\n\n# skip\nσκύλος\n  ")).toEqual([
      "γάτα",
      "σκύλος",
    ]);
  });
});

describe("createCaregiverPack", () => {
  it("builds spell tasks from words", () => {
    const pack = createCaregiverPack({
      title: " Week 12 ",
      words: ["λέξη", " ", "ώρα"],
      lessonLanguage: "el",
      ageBand: "primary",
    });
    expect(pack).not.toBeNull();
    if (!pack) throw new Error("expected pack");
    expect(pack.title).toBe("Week 12");
    expect(pack.source).toBe("caregiver");
    expect(pack.tasks).toEqual([
      { type: "spell", answer: "λέξη" },
      { type: "spell", answer: "ώρα" },
    ]);
    expect(isCaregiverLanguagePack(pack)).toBe(true);
  });

  it("returns null when there are no words", () => {
    expect(
      createCaregiverPack({
        title: "Empty",
        words: ["  "],
        lessonLanguage: "en",
        ageBand: "early",
      }),
    ).toBeNull();
  });
});

describe("listCustomPacksForLanguage", () => {
  it("filters caregiver packs by lesson language", () => {
    const el = createCaregiverPack({
      title: "EL",
      words: ["α"],
      lessonLanguage: "el",
      ageBand: "primary",
    });
    const en = createCaregiverPack({
      title: "EN",
      words: ["cat"],
      lessonLanguage: "en",
      ageBand: "primary",
    });
    expect(el).not.toBeNull();
    expect(en).not.toBeNull();
    if (!el || !en) throw new Error("expected packs");
    expect(listCustomPacksForLanguage([el, en], "el").map((p) => p.title)).toEqual([
      "EL",
    ]);
  });
});
