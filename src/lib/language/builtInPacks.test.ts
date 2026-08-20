import { describe, expect, it } from "vitest";
import { BUILT_IN_LANGUAGE_PACKS } from "./builtInPacks";
import {
  defaultLanguagePackId,
  filterPacksByBand,
  getLanguagePackById,
  listBuiltInPacksForBand,
} from "./packs";

describe("builtInPacks", () => {
  it("ships primary EL and EN packs", () => {
    expect(getLanguagePackById("el-spell-primary-01")).not.toBeNull();
    expect(getLanguagePackById("en-spell-primary-01")).not.toBeNull();
  });

  it("every pack has spell tasks with non-empty answers", () => {
    for (const pack of BUILT_IN_LANGUAGE_PACKS) {
      expect(pack.tasks.length).toBeGreaterThan(0);
      for (const task of pack.tasks) {
        expect(task.type).toBe("spell");
        expect(task.answer.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("filters by age band", () => {
    const primary = filterPacksByBand(BUILT_IN_LANGUAGE_PACKS, "primary");
    expect(primary.every((pack) => pack.ageBand === "primary")).toBe(true);
    expect(primary.length).toBeGreaterThanOrEqual(2);
  });

  it("defaults pack by band and preferred language", () => {
    expect(defaultLanguagePackId("primary", "el")).toBe("el-spell-primary-01");
    expect(defaultLanguagePackId("primary", "en")).toBe("en-spell-primary-01");
    expect(listBuiltInPacksForBand("early").length).toBeGreaterThanOrEqual(2);
  });
});
