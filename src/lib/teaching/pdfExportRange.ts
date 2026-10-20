import type { PdfAnnotationDoc } from "./pdfAnnotations";
import { clonePdfAnnotationDoc, emptyPdfAnnotationDoc } from "./pdfAnnotations";
import { isReachPdfPath, REACH_PDF_SUFFIX } from "./reachPdfPath";

export function normalizeExportPageRange(input: {
  from: number;
  to: number;
  pageCount: number;
}): { from: number; to: number } | { error: string } {
  const { from, to, pageCount } = input;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    !Number.isInteger(pageCount) ||
    pageCount < 1
  ) {
    return { error: "Invalid page range" };
  }
  if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
    return { error: "Page range is out of bounds" };
  }
  if (from > to) {
    return { error: "From page must be less than or equal to To page" };
  }
  return { from, to };
}

export function rangeForAllPages(pageCount: number): { from: number; to: number } {
  return { from: 1, to: pageCount };
}

export function rangeForCurrentPage(
  page: number,
  pageCount: number,
): { from: number; to: number } | { error: string } {
  return normalizeExportPageRange({ from: page, to: page, pageCount });
}

export function filterAndRemapAnnotations(
  doc: PdfAnnotationDoc,
  from: number,
  to: number,
): PdfAnnotationDoc {
  const out = emptyPdfAnnotationDoc();
  if (doc.originalPathHint) {
    out.originalPathHint = doc.originalPathHint;
  }
  for (let p = from; p <= to; p += 1) {
    const key = String(p);
    if (!Object.prototype.hasOwnProperty.call(doc.pages, key)) continue;
    const source = doc.pages[key];
    const remapped = clonePdfAnnotationDoc({
      schemaVersion: 1,
      pages: { "1": source },
    }).pages["1"];
    out.pages[String(p - from + 1)] = remapped;
  }
  return out;
}

function exportBaseName(originalPath: string): string {
  const normalized = originalPath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const fileName = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  if (isReachPdfPath(fileName)) {
    return fileName.slice(0, fileName.length - REACH_PDF_SUFFIX.length);
  }
  if (fileName.toLowerCase().endsWith(".pdf")) {
    return fileName.slice(0, fileName.length - 4);
  }
  return fileName;
}

export function suggestedExportFileName(
  originalPath: string,
  from: number,
  to: number,
): string {
  const base = exportBaseName(originalPath);
  if (from === to) return `${base}-page-${from}.reach.pdf`;
  return `${base}-pages-${from}-${to}.reach.pdf`;
}
