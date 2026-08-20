export const TEACHING_EBOOK_HOME =
  "https://ebooks.edu.gr/ebooks/v2/allcoursesdiadrastika.jsp";

export const TEACHING_EBOOK_WINDOW_LABEL = "teaching-ebook";

export const TEACHING_EBOOK_NAVIGATED_EVENT = "teaching-ebook-navigated";
export const TEACHING_EBOOK_DESTROYED_EVENT = "teaching-ebook-destroyed";

export type FreeWriteRightMode = "pdf" | "ebook";

/** Persist only allowlisted ebooks.edu.gr URLs. */
export function sanitizeTeachingEbookUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname !== "ebooks.edu.gr") return null;
    return url.toString();
  } catch {
    return null;
  }
}
