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
  redo: () => void;
};

export type UndoStack = {
  push: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  size: () => number;
  redoSize: () => number;
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
  const undoEntries: UndoEntry[] = [];
  const redoEntries: UndoEntry[] = [];
  return {
    push(entry) {
      undoEntries.push(entry);
      redoEntries.length = 0;
      while (undoEntries.length > max) {
        undoEntries.shift();
      }
    },
    undo() {
      const entry = undoEntries.pop();
      if (!entry) return;
      entry.undo();
      redoEntries.push(entry);
      while (redoEntries.length > max) {
        redoEntries.shift();
      }
    },
    redo() {
      const entry = redoEntries.pop();
      if (!entry) return;
      entry.redo();
      undoEntries.push(entry);
      while (undoEntries.length > max) {
        undoEntries.shift();
      }
    },
    clear() {
      undoEntries.length = 0;
      redoEntries.length = 0;
    },
    size() {
      return undoEntries.length;
    },
    redoSize() {
      return redoEntries.length;
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
