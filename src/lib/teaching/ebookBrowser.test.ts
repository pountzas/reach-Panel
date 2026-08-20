import { describe, expect, it } from "vitest";
import { sanitizeTeachingEbookUrl, TEACHING_EBOOK_HOME } from "./ebookBrowser";

describe("sanitizeTeachingEbookUrl", () => {
  it("accepts catalog and book URLs", () => {
    expect(sanitizeTeachingEbookUrl(TEACHING_EBOOK_HOME)).toBe(TEACHING_EBOOK_HOME);
    expect(
      sanitizeTeachingEbookUrl(
        "https://ebooks.edu.gr/ebooks/v/html/8547/2156/Mathimatika_A-Dimotikou_html-empl/",
      ),
    ).toContain("Mathimatika_A-Dimotikou_html-empl");
  });

  it("rejects other hosts", () => {
    expect(sanitizeTeachingEbookUrl("https://example.com/")).toBeNull();
    expect(sanitizeTeachingEbookUrl("file:///C:/x.html")).toBeNull();
    expect(sanitizeTeachingEbookUrl("")).toBeNull();
  });
});
