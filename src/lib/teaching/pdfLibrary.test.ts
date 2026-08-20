import { describe, expect, it } from "vitest";
import {
  TEACHING_PDF_LIBRARY_CAP,
  removeTeachingPdfEntry,
  upsertTeachingPdfEntry,
} from "./pdfLibrary";

const base = (id: string, lastOpenedAt: string) => ({
  id,
  title: `${id}.pdf`,
  path: `C:\\docs\\${id}.pdf`,
  lastOpenedAt,
});

describe("upsertTeachingPdfEntry", () => {
  it("updates existing path by id and bumps lastOpenedAt", () => {
    const next = upsertTeachingPdfEntry(
      [base("a", "2026-01-01T00:00:00.000Z")],
      base("a", "2026-08-20T12:00:00.000Z"),
    );
    expect(next).toHaveLength(1);
    expect(next[0].lastOpenedAt).toBe("2026-08-20T12:00:00.000Z");
  });

  it("caps at TEACHING_PDF_LIBRARY_CAP dropping oldest lastOpenedAt", () => {
    const seeded = Array.from({ length: TEACHING_PDF_LIBRARY_CAP }, (_, i) =>
      base(`id-${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const next = upsertTeachingPdfEntry(
      seeded,
      base("new", "2026-08-20T00:00:00.000Z"),
    );
    expect(next).toHaveLength(TEACHING_PDF_LIBRARY_CAP);
    expect(next.find((e) => e.id === "id-0")).toBeUndefined();
    expect(next.find((e) => e.id === "new")).toBeTruthy();
  });
});

describe("removeTeachingPdfEntry", () => {
  it("removes by id", () => {
    expect(removeTeachingPdfEntry([base("a", "2026-01-01T00:00:00.000Z")], "a")).toEqual([]);
  });
});
