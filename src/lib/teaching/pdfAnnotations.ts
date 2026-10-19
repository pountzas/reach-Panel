export type PdfPoint = [number, number];

export type PdfStroke = {
  id: string;
  color: string;
  width: number;
  points: PdfPoint[];
}

export type PdfTextBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  body: string;
}

export type PdfPageAnnotations = {
  strokes: PdfStroke[];
  texts: PdfTextBox[];
}

export type PdfAnnotationDoc = {
  schemaVersion: 1;
  originalPathHint?: string;
  pages: Record<string, PdfPageAnnotations>;
}

export type UndoEntry = {
  undo: () => void;
  redo: () => void;
}

export type UndoStack = {
  push: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  size: () => number;
  redoSize: () => number;
}

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
  const pages: Record<string, PdfPageAnnotations> = {};
  if (obj.pages && typeof obj.pages === "object" && !Array.isArray(obj.pages)) {
    for (const [key, value] of Object.entries(
      obj.pages as Record<string, unknown>,
    )) {
      if (!value || typeof value !== "object") continue;
      const page = value as Partial<Record<keyof PdfPageAnnotations, unknown>>;
      pages[key] = {
        strokes: Array.isArray(page.strokes)
          ? page.strokes.filter(
              (s): s is PdfStroke =>
                typeof s === "object" &&
                s != null &&
                Array.isArray((s as PdfStroke).points),
            )
          : [],
        texts: Array.isArray(page.texts)
          ? page.texts.filter(
              (t): t is PdfTextBox =>
                typeof t === "object" &&
                t != null &&
                typeof (t as PdfTextBox).body === "string",
            )
          : [],
      };
    }
  }
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

function pageOf(
  doc: PdfAnnotationDoc,
  pageKey: string,
): PdfPageAnnotations | undefined {
  return Object.prototype.hasOwnProperty.call(doc.pages, pageKey)
    ? doc.pages[pageKey]
    : undefined;
}

export function ensurePage(
  doc: PdfAnnotationDoc,
  pageKey: string,
): PdfPageAnnotations {
  const existing = pageOf(doc, pageKey);
  if (existing) return existing;
  const page: PdfPageAnnotations = { strokes: [], texts: [] };
  doc.pages[pageKey] = page;
  return page;
}

export function clonePdfAnnotationDoc(doc: PdfAnnotationDoc): PdfAnnotationDoc {
  return parsePdfAnnotationJson(serializePdfAnnotationJson(doc));
}

/** Per-gesture undo/redo payload — never a full document snapshot. */
export type PdfAnnotationChange =
  | { kind: "addStroke"; pageKey: string; stroke: PdfStroke }
  | { kind: "removeStrokes"; pageKey: string; strokes: PdfStroke[] }
  | { kind: "restoreStrokes"; pageKey: string; strokes: PdfStroke[] }
  /** Eraser gesture: page stroke list before/after (may trim or drop strokes). */
  | {
      kind: "replaceStrokes";
      pageKey: string;
      before: PdfStroke[];
      after: PdfStroke[];
    }
  | { kind: "addText"; pageKey: string; box: PdfTextBox }
  | { kind: "removeText"; pageKey: string; box: PdfTextBox }
  | {
      kind: "moveText";
      pageKey: string;
      id: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    };

function emptyPage(): PdfPageAnnotations {
  return { strokes: [], texts: [] };
}

function withPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  page: PdfPageAnnotations,
): PdfAnnotationDoc {
  return {
    ...doc,
    pages: {
      ...doc.pages,
      [pageKey]: page,
    },
  };
}

export function addStrokeToPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  stroke: PdfStroke,
): PdfAnnotationDoc {
  const prev = doc.pages[pageKey] ?? emptyPage();
  return withPage(doc, pageKey, {
    ...prev,
    strokes: [...prev.strokes, stroke],
  });
}

export function removeStrokesFromPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  strokeIds: ReadonlySet<string>,
): PdfAnnotationDoc {
  const prev = pageOf(doc, pageKey);
  if (!prev) return doc;
  const strokes = prev.strokes.filter((s) => !strokeIds.has(s.id));
  if (strokes.length === prev.strokes.length) return doc;
  return withPage(doc, pageKey, { ...prev, strokes });
}

export function replacePageStrokes(
  doc: PdfAnnotationDoc,
  pageKey: string,
  strokes: PdfStroke[],
): PdfAnnotationDoc {
  const prev = doc.pages[pageKey] ?? emptyPage();
  if (prev.strokes === strokes) return doc;
  return withPage(doc, pageKey, { ...prev, strokes });
}

export function addTextToPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  box: PdfTextBox,
): PdfAnnotationDoc {
  const prev = doc.pages[pageKey] ?? emptyPage();
  return withPage(doc, pageKey, {
    ...prev,
    texts: [...prev.texts, box],
  });
}

export function moveTextOnPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  id: string,
  pos: { x: number; y: number },
): PdfAnnotationDoc {
  const prev = pageOf(doc, pageKey);
  if (!prev) return doc;
  const index = prev.texts.findIndex((t) => t.id === id);
  if (index < 0) return doc;
  const texts = prev.texts.map((t) => {
    if (t.id !== id) return t;
    if (t.x === pos.x && t.y === pos.y) return t;
    return { ...t, x: pos.x, y: pos.y };
  });
  return withPage(doc, pageKey, { ...prev, texts });
}

/** Re-insert removed strokes (undo erase). Appends missing strokes only. */
export function restoreStrokesToPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  strokes: PdfStroke[],
): PdfAnnotationDoc {
  if (strokes.length === 0) return doc;
  const prev = doc.pages[pageKey] ?? emptyPage();
  const existing = new Set(prev.strokes.map((s) => s.id));
  const toAdd = strokes.filter((s) => !existing.has(s.id));
  if (toAdd.length === 0) return doc;
  return withPage(doc, pageKey, {
    ...prev,
    strokes: [...prev.strokes, ...toAdd],
  });
}

export function removeTextFromPage(
  doc: PdfAnnotationDoc,
  pageKey: string,
  id: string,
): PdfAnnotationDoc {
  const prev = pageOf(doc, pageKey);
  if (!prev) return doc;
  const texts = prev.texts.filter((t) => t.id !== id);
  if (texts.length === prev.texts.length) return doc;
  return withPage(doc, pageKey, { ...prev, texts });
}

export function applyPdfAnnotationChange(
  doc: PdfAnnotationDoc,
  change: PdfAnnotationChange,
): PdfAnnotationDoc {
  switch (change.kind) {
    case "addStroke":
      return addStrokeToPage(doc, change.pageKey, change.stroke);
    case "removeStrokes": {
      const ids = new Set(change.strokes.map((s) => s.id));
      return removeStrokesFromPage(doc, change.pageKey, ids);
    }
    case "restoreStrokes":
      return restoreStrokesToPage(doc, change.pageKey, change.strokes);
    case "replaceStrokes":
      return replacePageStrokes(doc, change.pageKey, change.after);
    case "addText":
      return addTextToPage(doc, change.pageKey, change.box);
    case "removeText":
      return removeTextFromPage(doc, change.pageKey, change.box.id);
    case "moveText":
      return moveTextOnPage(doc, change.pageKey, change.id, change.to);
    default: {
      const _exhaustive: never = change;
      return _exhaustive;
    }
  }
}

export function invertPdfAnnotationChange(
  change: PdfAnnotationChange,
): PdfAnnotationChange {
  switch (change.kind) {
    case "addStroke":
      return {
        kind: "removeStrokes",
        pageKey: change.pageKey,
        strokes: [change.stroke],
      };
    case "removeStrokes":
      return {
        kind: "restoreStrokes",
        pageKey: change.pageKey,
        strokes: change.strokes,
      };
    case "restoreStrokes":
      return {
        kind: "removeStrokes",
        pageKey: change.pageKey,
        strokes: change.strokes,
      };
    case "replaceStrokes":
      return {
        kind: "replaceStrokes",
        pageKey: change.pageKey,
        before: change.after,
        after: change.before,
      };
    case "addText":
      return {
        kind: "removeText",
        pageKey: change.pageKey,
        box: change.box,
      };
    case "removeText":
      return {
        kind: "addText",
        pageKey: change.pageKey,
        box: change.box,
      };
    case "moveText":
      return {
        kind: "moveText",
        pageKey: change.pageKey,
        id: change.id,
        from: change.to,
        to: change.from,
      };
    default: {
      const _exhaustive: never = change;
      return _exhaustive;
    }
  }
}
