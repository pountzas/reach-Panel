import type { StateCreator } from "zustand";
import type { AppStore, PdfSlice } from "../types";
import {
  dropTeachingSuggestionPrefix,
  teachingPdfFileName,
} from "../storeShared";
import { invoke } from "@tauri-apps/api/core";
import { notify } from "../../lib/notify";
import {
  clearTeachingPdf,
  clonePdfAnnotationDoc,
  createUndoStack,
  emptyPdfAnnotationDoc,
  migrateToSingleTeachingPdf,
  parsePdfAnnotationJson,
  replaceTeachingPdf,
  serializePdfAnnotationJson,
  suggestedExportFileName,
} from "../../lib/teaching";
import type { TeachingPdfEntry } from "../../lib/teaching";
import { t as translate } from "../../i18n";

const SAVE_DEBOUNCE_MS = 400;
let freeWriteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let freeWriteUndoStack = createUndoStack(50);
let freeWriteAnnotationsPath: string | null = null;

function resetFreeWriteUndo(): void {
  freeWriteUndoStack = createUndoStack(50);
}

export const createPdfSlice: StateCreator<AppStore, [], [], PdfSlice> = (
  set,
  get,
) => ({
  teachingPdfLibrary: [],
  freeWriteActivePdfId: null,
  freeWritePdfTool: "pointer",
  freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
  freeWriteSelectedTextId: null,
  freeWriteAnnotationDirty: false,
  freeWriteUndoDepth: 0,
  freeWriteRedoDepth: 0,
  loadTeachingPdfLibrary: async () => {
    try {
      const raw = await invoke<TeachingPdfEntry[]>(
        "cmd_list_teaching_pdfs",
      );
      const filtered = Array.isArray(raw)
        ? raw.filter(
            (e) => e && typeof e.id === "string" && typeof e.path === "string",
          )
        : [];
      const { entries, didMigrate } = migrateToSingleTeachingPdf(filtered);
      if (didMigrate) {
        await invoke("cmd_save_teaching_pdfs", { entries });
      }
      const kept = entries[0] ?? null;
      const lastId = get().settings.freeWriteLastPdfId ?? null;
      const freeWriteActivePdfId =
        kept == null
          ? null
          : lastId === kept.id
            ? lastId
            : kept.id;
      set({ teachingPdfLibrary: entries, freeWriteActivePdfId });
      if (kept && lastId !== kept.id) {
        await get().updateSettings({ freeWriteLastPdfId: kept.id });
      }
      if (!kept && lastId) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
      await get().loadFreeWriteAnnotations(kept?.path ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  pickTeachingPdf: async () => {
    try {
      await get().flushFreeWriteAnnotations();
      const path = await invoke<string | null>("cmd_pick_teaching_pdf");
      if (!path) return;
      const existing = get().teachingPdfLibrary.find((e) => e.path === path);
      const entry: TeachingPdfEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        title: teachingPdfFileName(path),
        path,
        lastOpenedAt: new Date().toISOString(),
      };
      const teachingPdfLibrary = replaceTeachingPdf(entry);
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      set({
        teachingPdfLibrary,
        freeWriteActivePdfId: entry.id,
        freeWritePdfTool: "pointer",
      });
      await get().updateSettings({ freeWriteLastPdfId: entry.id });
      await get().loadFreeWriteAnnotations(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  closeTeachingPdf: async () => {
    try {
      await get().flushFreeWriteAnnotations();
      const teachingPdfLibrary = clearTeachingPdf();
      await invoke("cmd_save_teaching_pdfs", { entries: teachingPdfLibrary });
      freeWriteAnnotationsPath = null;
      resetFreeWriteUndo();
      set({
        teachingPdfLibrary,
        freeWriteActivePdfId: null,
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteRedoDepth: 0,
        freeWritePdfTool: "pointer",
        freeWriteFocus:
          get().freeWriteFocus === "pdf" || get().freeWriteFocus === "pdfText"
            ? "notepad"
            : get().freeWriteFocus,
      });
      if (get().settings.freeWriteLastPdfId) {
        await get().updateSettings({ freeWriteLastPdfId: null });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  setFreeWritePdfTool: (tool) => {
    const prevId = get().freeWriteSelectedTextId;
    const prevFocus = get().freeWriteFocus;
    const nextId = tool === "text" ? prevId : null;
    const nextFocus = tool === "text" ? prevFocus : "pdf";
    if (prevId !== nextId || prevFocus !== nextFocus) {
      dropTeachingSuggestionPrefix(set);
    }
    set({
      freeWritePdfTool: tool,
      freeWriteSelectedTextId: nextId,
      freeWriteFocus: nextFocus,
    });
  },
  setFreeWriteSelectedTextId: (id) => {
    const prevId = get().freeWriteSelectedTextId;
    const tool = get().freeWritePdfTool;
    if (id === null) {
      if (prevId !== null || get().freeWriteFocus !== "pdf") {
        dropTeachingSuggestionPrefix(set);
      }
      set({
        freeWriteSelectedTextId: null,
        freeWriteFocus: "pdf",
      });
      void get().syncWindowFocusable();
      return;
    }
    if (tool === "pointer") {
      if (prevId !== id || get().freeWriteFocus !== "pdf") {
        dropTeachingSuggestionPrefix(set);
      }
      set({
        freeWriteSelectedTextId: id,
        freeWriteFocus: "pdf",
      });
      void get().syncWindowFocusable();
      return;
    }
    const nextFocus = "pdfText";
    if (prevId !== id || get().freeWriteFocus !== nextFocus) {
      dropTeachingSuggestionPrefix(set);
    }
    set({
      freeWriteSelectedTextId: id,
      freeWriteFocus: nextFocus,
      freeWritePdfTool: "text",
    });
    void get().syncWindowFocusable();
  },
  beginFreeWritePdfTextEdit: (id) => {
    const prevId = get().freeWriteSelectedTextId;
    if (prevId !== id || get().freeWriteFocus !== "pdfText") {
      dropTeachingSuggestionPrefix(set);
    }
    set({
      freeWritePdfTool: "text",
      freeWriteSelectedTextId: id,
      freeWriteFocus: "pdfText",
    });
    void get().syncWindowFocusable();
  },
  loadFreeWriteAnnotations: async (path) => {
    if (freeWriteSaveTimer) {
      clearTimeout(freeWriteSaveTimer);
      freeWriteSaveTimer = null;
    }
    resetFreeWriteUndo();
    freeWriteAnnotationsPath = path;
    if (!path) {
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteRedoDepth: 0,
      });
      return;
    }
    try {
      const result = await invoke<{ json: string }>(
        "cmd_read_teaching_reach_annotations",
        { path },
      );
      const doc = parsePdfAnnotationJson(result.json);
      set({
        freeWriteAnnotationDoc: doc,
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteRedoDepth: 0,
        freeWritePdfTool: "pointer",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteRedoDepth: 0,
      });
    }
  },
  scheduleSaveFreeWriteAnnotations: () => {
    if (freeWriteSaveTimer) clearTimeout(freeWriteSaveTimer);
    freeWriteSaveTimer = setTimeout(() => {
      freeWriteSaveTimer = null;
      void get().flushFreeWriteAnnotations();
    }, SAVE_DEBOUNCE_MS);
  },
  flushFreeWriteAnnotations: async () => {
    if (freeWriteSaveTimer) {
      clearTimeout(freeWriteSaveTimer);
      freeWriteSaveTimer = null;
    }
    const state = get();
    if (!state.freeWriteAnnotationDirty || !freeWriteAnnotationsPath) return;
    try {
      const result = await invoke<{
        reachPath: string;
        appearanceWarning?: string | null;
      }>("cmd_write_teaching_reach_annotations", {
        path: freeWriteAnnotationsPath,
        json: serializePdfAnnotationJson(state.freeWriteAnnotationDoc),
      });
      set({ freeWriteAnnotationDirty: false });
      if (result.appearanceWarning) {
        notify.info(result.appearanceWarning);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  exportTeachingReachPdf: async (from, to) => {
    const state = get();
    const active =
      state.teachingPdfLibrary.find((e) => e.id === state.freeWriteActivePdfId) ??
      state.teachingPdfLibrary[0] ??
      null;
    if (!active?.path) {
      notify.error(translate(state.settings.uiLanguage, "freeWritePdfEmpty"));
      return;
    }
    try {
      await get().flushFreeWriteAnnotations();
      const suggestedName = suggestedExportFileName(active.path, from, to);
      const destPath = await invoke<string | null>(
        "cmd_pick_teaching_reach_export_path",
        { suggestedName },
      );
      if (!destPath) return;
      const result = await invoke<{
        destPath: string;
        appearanceWarning?: string | null;
      }>("cmd_export_teaching_reach_pdf", {
        sourcePath: active.path,
        fromPage: from,
        toPage: to,
        destPath,
      });
      notify.success(
        translate(state.settings.uiLanguage, "freeWritePdfExportSuccess"),
      );
      if (result.appearanceWarning) {
        notify.info(result.appearanceWarning);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
    }
  },
  clearAllFreeWriteAnnotations: async () => {
    const path = freeWriteAnnotationsPath;
    if (!path) {
      resetFreeWriteUndo();
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteRedoDepth: 0,
      });
      return true;
    }
    try {
      if (freeWriteSaveTimer) {
        clearTimeout(freeWriteSaveTimer);
        freeWriteSaveTimer = null;
      }
      await invoke("cmd_delete_teaching_reach_pdf", { path });
      resetFreeWriteUndo();
      set({
        freeWriteAnnotationDoc: emptyPdfAnnotationDoc(),
        freeWriteSelectedTextId: null,
        freeWriteAnnotationDirty: false,
        freeWriteUndoDepth: 0,
        freeWriteRedoDepth: 0,
        freeWriteFocus:
          get().freeWriteFocus === "pdfText" ? "pdf" : get().freeWriteFocus,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(message);
      return false;
    }
  },
  applyFreeWriteAnnotationUpdater: (updater, options) => {
    const current = get().freeWriteAnnotationDoc;
    const next = updater(clonePdfAnnotationDoc(current));
    const pushUndo = options?.pushUndo !== false;
    if (pushUndo) {
      const before = clonePdfAnnotationDoc(options?.undoFrom ?? current);
      const after = clonePdfAnnotationDoc(next);
      freeWriteUndoStack.push({
        undo: () => {
          set({
            freeWriteAnnotationDoc: before,
            freeWriteAnnotationDirty: true,
          });
          get().scheduleSaveFreeWriteAnnotations();
        },
        redo: () => {
          set({
            freeWriteAnnotationDoc: after,
            freeWriteAnnotationDirty: true,
          });
          get().scheduleSaveFreeWriteAnnotations();
        },
      });
    }
    set({
      freeWriteAnnotationDoc: next,
      freeWriteAnnotationDirty: true,
      freeWriteUndoDepth: freeWriteUndoStack.size(),
      freeWriteRedoDepth: freeWriteUndoStack.redoSize(),
    });
    get().scheduleSaveFreeWriteAnnotations();
  },
  undoFreeWriteAnnotation: () => {
    freeWriteUndoStack.undo();
    set({
      freeWriteUndoDepth: freeWriteUndoStack.size(),
      freeWriteRedoDepth: freeWriteUndoStack.redoSize(),
    });
  },
  redoFreeWriteAnnotation: () => {
    freeWriteUndoStack.redo();
    set({
      freeWriteUndoDepth: freeWriteUndoStack.size(),
      freeWriteRedoDepth: freeWriteUndoStack.redoSize(),
    });
  },
});
