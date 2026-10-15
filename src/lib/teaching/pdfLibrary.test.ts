import { describe, expect, it } from "vitest";
import {
  clearTeachingPdf,
  migrateToSingleTeachingPdf,
  replaceTeachingPdf,
  sortTeachingPdfEntriesByRecent,
} from "./pdfLibrary";

const base = (
  id: string,
  lastOpenedAt: string,
  path = `C:\\docs\\${id}.pdf`,
) => ({
  id,
  title: `${id}.pdf`,
  path,
  lastOpenedAt,
});

describe("sortTeachingPdfEntriesByRecent", () => {
  it("orders by lastOpenedAt descending", () => {
    const sorted = sortTeachingPdfEntriesByRecent([
      base("a", "2026-01-01T00:00:00.000Z"),
      base("b", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("migrateToSingleTeachingPdf", () => {
  it("keeps empty as empty without migrate flag", () => {
    expect(migrateToSingleTeachingPdf([])).toEqual({
      entries: [],
      didMigrate: false,
    });
  });

  it("keeps a single entry without migrate flag", () => {
    const one = [base("a", "2026-01-01T00:00:00.000Z")];
    expect(migrateToSingleTeachingPdf(one)).toEqual({
      entries: one,
      didMigrate: false,
    });
  });

  it("keeps most recent when multiple; didMigrate true", () => {
    const result = migrateToSingleTeachingPdf([
      base("old", "2026-01-01T00:00:00.000Z"),
      base("mid", "2026-03-01T00:00:00.000Z"),
      base("new", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(result.didMigrate).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe("new");
  });

  it("breaks lastOpenedAt ties by id ascending", () => {
    const result = migrateToSingleTeachingPdf([
      base("b", "2026-08-20T00:00:00.000Z"),
      base("a", "2026-08-20T00:00:00.000Z"),
    ]);
    expect(result.entries[0].id).toBe("a");
    expect(result.didMigrate).toBe(true);
  });
});

describe("replaceTeachingPdf", () => {
  it("returns a one-element library", () => {
    const entry = base("x", "2026-08-20T00:00:00.000Z");
    expect(replaceTeachingPdf(entry)).toEqual([entry]);
  });
});

describe("clearTeachingPdf", () => {
  it("returns empty library", () => {
    expect(clearTeachingPdf()).toEqual([]);
  });
});
