import { invoke } from "@tauri-apps/api/core";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { clonePdfAnnotationDoc, ensurePage } from "../../lib/teaching";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { CloseIcon, LoadSongIcon, TrashIcon } from "../common/SectionIcons";
import { TeachingLessonToolbarButton } from "./TeachingLessonPanel";
import { FreeWritePdfAnnotationOverlay } from "./FreeWritePdfAnnotationOverlay";
import { FreeWritePdfExportDialog } from "./FreeWritePdfExportDialog";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const TOOLBAR_ICON_CLASS = "h-5 w-5";

type PdfPayload = { path: string; contentBase64: string };

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** PDF library controls + pdf.js page viewer for Free write. */
export function FreeWritePdfPane() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const teachingPdfLibrary = useAppStore((s) => s.teachingPdfLibrary);
  const freeWriteActivePdfId = useAppStore((s) => s.freeWriteActivePdfId);
  const loadTeachingPdfLibrary = useAppStore((s) => s.loadTeachingPdfLibrary);
  const pickTeachingPdf = useAppStore((s) => s.pickTeachingPdf);
  const closeTeachingPdf = useAppStore((s) => s.closeTeachingPdf);
  const setFreeWriteFocus = useAppStore((s) => s.setFreeWriteFocus);
  const tool = useAppStore((s) => s.freeWritePdfTool);
  const setTool = useAppStore((s) => s.setFreeWritePdfTool);
  const undoDepth = useAppStore((s) => s.freeWriteUndoDepth);
  const undoAnnotation = useAppStore((s) => s.undoFreeWriteAnnotation);
  const clearAll = useAppStore((s) => s.clearAllFreeWriteAnnotations);
  const exportTeachingReachPdf = useAppStore((s) => s.exportTeachingReachPdf);
  const selectedTextId = useAppStore((s) => s.freeWriteSelectedTextId);
  const setSelectedTextId = useAppStore((s) => s.setFreeWriteSelectedTextId);
  const applyUpdater = useAppStore((s) => s.applyFreeWriteAnnotationUpdater);

  const surface = getSurfaceColors(settings.appBgColor);
  const [exportOpen, setExportOpen] = useState(false);
  const active =
    teachingPdfLibrary.find((e) => e.id === freeWriteActivePdfId) ??
    teachingPdfLibrary[0] ??
    null;
  const activePath = active?.path ?? null;

  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [viewerZoom, setViewerZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [docReadyPath, setDocReadyPath] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const missingLabelRef = useRef(t("freeWritePdfMissing"));
  missingLabelRef.current = t("freeWritePdfMissing");

  const setCanvasNode = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    setCanvasMounted(Boolean(el));
  }, []);

  useEffect(() => {
    void loadTeachingPdfLibrary();
  }, [loadTeachingPdfLibrary]);

  // Load (or clear) the PDF document when the active path changes.
  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      if (docRef.current) {
        void docRef.current.loadingTask.destroy();
        docRef.current = null;
      }
      setDocReadyPath(null);
      setError(null);
      setCanvasSize({ width: 0, height: 0 });

      if (!activePath) {
        setPageCount(0);
        return;
      }

      try {
        const payload = await invoke<PdfPayload>("cmd_read_teaching_pdf", {
          path: activePath,
        });
        if (cancelled) return;
        const data = base64ToUint8Array(payload.contentBase64);
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void doc.loadingTask.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPage(1);
        setDocReadyPath(activePath);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setPageCount(0);
        setError(message || missingLabelRef.current);
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      if (docRef.current) {
        void docRef.current.loadingTask.destroy();
        docRef.current = null;
      }
    };
  }, [activePath]);

  // Paint the current page whenever doc / page / zoom / canvas is ready.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || !canvasMounted || docReadyPath !== activePath || !activePath) {
      return;
    }

    let cancelled = false;

    async function paint() {
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      try {
        const pageNum = Math.min(Math.max(1, page), doc!.numPages);
        const pdfPage = await doc!.getPage(pageNum);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: viewerZoom / 100 });
        const context = canvas!.getContext("2d");
        if (!context) return;
        canvas!.width = viewport.width;
        canvas!.height = viewport.height;
        setCanvasSize({ width: viewport.width, height: viewport.height });
        const task = pdfPage.render({
          canvasContext: context,
          viewport,
          canvas: canvas!,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (cancelled) return;
        // pdf.js throws on intentional cancel — ignore those.
        const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
        if (name === "RenderingCancelledException") return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message || missingLabelRef.current);
      }
    }

    void paint();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [activePath, docReadyPath, page, viewerZoom, canvasMounted]);

  const toolBtn = (
    id: "pen" | "eraser" | "text",
    label: string,
    glyph: string,
  ) => (
    <TeachingLessonToolbarButton
      key={id}
      label={label}
      onClick={() => setTool(id)}
      backgroundColor={tool === id ? surface.panelHeaderBg : surface.panelBg}
      borderColor={surface.panelBorder}
      color={surface.panelText}
    >
      <span className="text-sm font-medium">{glyph}</span>
    </TeachingLessonToolbarButton>
  );

  const deleteSelectedText = () => {
    if (!selectedTextId) return;
    applyUpdater((d) => {
      const next = clonePdfAnnotationDoc(d);
      for (const key of Object.keys(next.pages)) {
        const p = ensurePage(next, key);
        p.texts = p.texts.filter((box) => box.id !== selectedTextId);
      }
      return next;
    });
    setSelectedTextId(null);
  };

  const onClearAll = () => {
    if (!window.confirm(t("freeWritePdfClearAllConfirm"))) return;
    void clearAll();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      onPointerDown={() => {
        if (useAppStore.getState().freeWriteFocus !== "pdfText") {
          setFreeWriteFocus("pdf");
        }
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <TeachingLessonToolbarButton
          label={t("freeWriteOpenPdf")}
          onClick={() => void pickTeachingPdf()}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <LoadSongIcon className={TOOLBAR_ICON_CLASS} />
        </TeachingLessonToolbarButton>
        {active ? (
          <TeachingLessonToolbarButton
            label={t("freeWriteClosePdf")}
            onClick={() => void closeTeachingPdf()}
            backgroundColor={surface.panelBg}
            borderColor={surface.panelBorder}
            color={surface.panelText}
          >
            <CloseIcon className={TOOLBAR_ICON_CLASS} />
          </TeachingLessonToolbarButton>
        ) : null}
        <TeachingLessonToolbarButton
          label={t("freeWritePdfPrevPage")}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-sm">◀</span>
        </TeachingLessonToolbarButton>
        <span className="text-xs" style={{ color: surface.panelMutedText }}>
          {pageCount > 0 ? `${page} / ${pageCount}` : "—"}
        </span>
        <TeachingLessonToolbarButton
          label={t("freeWritePdfNextPage")}
          onClick={() => setPage((p) => Math.min(pageCount || 1, p + 1))}
          disabled={!pageCount || page >= pageCount}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-sm">▶</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteZoomOut")}
          onClick={() => setViewerZoom((z) => Math.max(50, z - 25))}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-lg leading-none">−</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteZoomIn")}
          onClick={() => setViewerZoom((z) => Math.min(250, z + 25))}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-lg leading-none">+</span>
        </TeachingLessonToolbarButton>
        {active ? (
          <>
            {toolBtn("pen", t("freeWritePdfPen"), "✏")}
            {toolBtn("eraser", t("freeWritePdfEraser"), "⌫")}
            {toolBtn("text", t("freeWritePdfTextTool"), "T")}
            <TeachingLessonToolbarButton
              label={t("freeWritePdfUndo")}
              onClick={() => undoAnnotation()}
              disabled={undoDepth <= 0}
              backgroundColor={surface.panelBg}
              borderColor={surface.panelBorder}
              color={surface.panelText}
            >
              <span className="text-sm">↶</span>
            </TeachingLessonToolbarButton>
            <TeachingLessonToolbarButton
              label={t("freeWritePdfClearAll")}
              onClick={onClearAll}
              backgroundColor={surface.panelBg}
              borderColor={surface.panelBorder}
              color={surface.panelText}
            >
              <span className="text-xs font-medium">CLR</span>
            </TeachingLessonToolbarButton>
            <TeachingLessonToolbarButton
              label={t("freeWritePdfExport")}
              onClick={() => setExportOpen(true)}
              backgroundColor={surface.panelBg}
              borderColor={surface.panelBorder}
              color={surface.panelText}
            >
              <span className="text-xs font-medium">EXP</span>
            </TeachingLessonToolbarButton>
            {selectedTextId ? (
              <TeachingLessonToolbarButton
                label={t("freeWritePdfDeleteText")}
                onClick={deleteSelectedText}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <TrashIcon className={TOOLBAR_ICON_CLASS} />
              </TeachingLessonToolbarButton>
            ) : null}
            <span
              className="min-w-0 max-w-[12rem] truncate text-xs"
              style={{ color: surface.panelText }}
              title={active.path}
            >
              {active.title}
            </span>
          </>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto rounded-md border p-2"
        style={{ borderColor: surface.panelBorder, backgroundColor: surface.insetBg }}
      >
        {error ? (
          <div className="space-y-2 text-sm" style={{ color: surface.panelText }}>
            <p>{t("freeWritePdfMissing")}</p>
            <p className="text-xs" style={{ color: surface.panelMutedText }}>
              {error}
            </p>
          </div>
        ) : !active ? (
          <p className="text-sm" style={{ color: surface.panelMutedText }}>
            {t("freeWritePdfEmpty")}
          </p>
        ) : (
          <div className="relative mx-auto w-fit max-w-full">
            <canvas ref={setCanvasNode} className="block max-w-full" />
            {canvasSize.width > 0 && canvasSize.height > 0 ? (
              <FreeWritePdfAnnotationOverlay
                page={page}
                width={canvasSize.width}
                height={canvasSize.height}
              />
            ) : null}
          </div>
        )}
      </div>

      <FreeWritePdfExportDialog
        open={exportOpen && Boolean(active)}
        pageCount={pageCount}
        currentPage={page}
        surface={surface}
        onCancel={() => setExportOpen(false)}
        onExport={(from, to) => {
          setExportOpen(false);
          void exportTeachingReachPdf(from, to);
        }}
      />
    </div>
  );
}
