export type PdfPoint = [number, number];

export type PdfStroke = {
  id: string;
  color: string;
  width: number;
  points: PdfPoint[];
};

export type PdfTextBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  body: string;
};

export type PdfPageAnnotations = {
  strokes: PdfStroke[];
  texts: PdfTextBox[];
};

export type PdfAnnotationDoc = {
  schemaVersion: 1;
  originalPathHint?: string;
  pages: Record<string, PdfPageAnnotations>;
};

export type UndoEntry = {
  undo: () => void;
};

export type UndoStack = {
  push: (entry: UndoEntry) => void;
  undo: () => void;
  clear: () => void;
  size: () => number;
};

const SCHEMA_VERSION = 1 as const;

export function emptyPdfAnnotationDoc(): PdfAnnotationDoc {
  return { schemaVersion: SCHEMA_VERSION, pages: {} };
}

export function serializePdfAnnotationJson(doc: PdfAnnotationDoc): string {
  return JSON.stringify(doc);
}

export function parsePdfAnnotationJson(text: string): PdfAnnotationDoc {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid PDF annotation document");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported PDF annotation schemaVersion: ${String(obj.schemaVersion)}`,
    );
  }
  const pages =
    obj.pages && typeof obj.pages === "object" && !Array.isArray(obj.pages)
      ? (obj.pages as Record<string, PdfPageAnnotations>)
      : {};
  const doc: PdfAnnotationDoc = {
    schemaVersion: SCHEMA_VERSION,
    pages,
  };
  if (typeof obj.originalPathHint === "string") {
    doc.originalPathHint = obj.originalPathHint;
  }
  return doc;
}

export function createUndoStack(max = 50): UndoStack {
  const entries: UndoEntry[] = [];
  return {
    push(entry) {
      entries.push(entry);
      while (entries.length > max) {
        entries.shift();
      }
    },
    undo() {
      const entry = entries.pop();
      entry?.undo();
    },
    clear() {
      entries.length = 0;
    },
    size() {
      return entries.length;
    },
  };
}

export function ensurePage(
  doc: PdfAnnotationDoc,
  pageKey: string,
): PdfPageAnnotations {
  const existing = doc.pages[pageKey];
  if (existing) return existing;
  const page: PdfPageAnnotations = { strokes: [], texts: [] };
  doc.pages[pageKey] = page;
  return page;
}

export function clonePdfAnnotationDoc(doc: PdfAnnotationDoc): PdfAnnotationDoc {
  return parsePdfAnnotationJson(serializePdfAnnotationJson(doc));
}
