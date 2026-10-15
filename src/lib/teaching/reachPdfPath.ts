/** Sibling working copy suffix: `name.reach.pdf` next to `name.pdf`. */
export const REACH_PDF_SUFFIX = ".reach.pdf";

const REACH_SUFFIX_RE = /\.reach\.pdf$/i;
const PDF_SUFFIX_RE = /\.pdf$/i;

export function isReachPdfPath(path: string): boolean {
  return REACH_SUFFIX_RE.test(path);
}

/** Map original or reach path → sibling `.reach.pdf` path. */
export function toReachPdfPath(path: string): string {
  if (isReachPdfPath(path)) return path;
  if (PDF_SUFFIX_RE.test(path)) {
    return path.replace(PDF_SUFFIX_RE, REACH_PDF_SUFFIX);
  }
  return `${path}${REACH_PDF_SUFFIX}`;
}

/** Map original or reach path → original `.pdf` path. */
export function toOriginalPdfPath(path: string): string {
  if (isReachPdfPath(path)) {
    return path.replace(REACH_SUFFIX_RE, ".pdf");
  }
  return path;
}
