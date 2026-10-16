import { invoke } from "@tauri-apps/api/core";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BiExport } from "react-icons/bi";
import { IoIosRedo, IoIosUndo } from "react-icons/io";
import { IoPencilOutline } from "react-icons/io5";
import { MdOutlineZoomIn, MdOutlineZoomOut } from "react-icons/md";
import { PiEraserLight } from "react-icons/pi";
import { getSurfaceColors } from "../../lib/colorProfiles";
import {
  clampFreeWritePdfZoom,
  clonePdfAnnotationDoc,
  ensurePage,
  formatFreeWriteZoomPercent,
  FREE_WRITE_ZOOM_STEP,
} from "../../lib/teaching";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { ConfirmDialog } from "../common/ConfirmDialog";
import {
  CloseIcon,
  LoadSongIcon,
  TextSlashIcon,
  TextToolIcon,
} from "../common/SectionIcons";
import { TeachingLessonToolbarButton } from "./TeachingLessonPanel";
import { FreeWritePdfAnnotationOverlay } from "./FreeWritePdfAnnotationOverlay";
import { FreeWritePdfExportDialog } from "./FreeWritePdfExportDialog";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const TOOLBAR_ICON_CLASS = "h-4 w-4";

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
  const redoDepth = useAppStore((s) => s.freeWriteRedoDepth);
  const undoAnnotation = useAppStore((s) => s.undoFreeWriteAnnotation);
  const redoAnnotation = useAppStore((s) => s.redoFreeWriteAnnotation);
  const clearAll = useAppStore((s) => s.clearAllFreeWriteAnnotations);
  const exportTeachingReachPdf = useAppStore((s) => s.exportTeachingReachPdf);
  const selectedTextId = useAppStore((s) => s.freeWriteSelectedTextId);
  const setSelectedTextId = useAppStore((s) => s.setFreeWriteSelectedTextId);
  const applyUpdater = useAppStore((s) => s.applyFreeWriteAnnotationUpdater);

  const surface = getSurfaceColors(settings.appBgColor);
  const [exportOpen, setExportOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const active =
    teachingPdfLibrary.find((e) => e.id === freeWriteActivePdfId) ??
    teachingPdfLibrary[0] ??
    null;
  const activePath = active?.path ?? null;

  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageDraft, setPageDraft] = useState("1");
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

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  const commitPageDraft = useCallback(() => {
    const parsed = Number.parseInt(pageDraft, 10);
    if (!Number.isFinite(parsed) || pageCount < 1) {
      setPageDraft(String(page));
      return;
    }
    const next = Math.min(pageCount, Math.max(1, parsed));
    setPage(next);
    setPageDraft(String(next));
  }, [page, pageCount, pageDraft]);

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
    icon: ReactNode,
  ) => (
    <TeachingLessonToolbarButton
      key={id}
      label={label}
      size="sm"
      onClick={() => setTool(id)}
      backgroundColor={tool === id ? surface.panelHeaderBg : surface.panelBg}
      borderColor={surface.panelBorder}
      color={surface.panelText}
    >
      {icon}
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

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      onPointerDown={() => {
        if (useAppStore.getState().freeWriteFocus !== "pdfText") {
          setFreeWriteFocus("pdf");
        }
      }}
    >
      <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 max-w-[40%] items-center">
          {active ? (
            <span
              className="min-w-0 truncate text-xs"
              style={{ color: surface.panelText }}
              title={active.path}
            >
              {active.title}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <TeachingLessonToolbarButton
            label={t("freeWritePdfPrevPage")}
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            backgroundColor={surface.panelBg}
            borderColor={surface.panelBorder}
            color={surface.panelText}
          >
            <span className="text-sm">◀</span>
          </TeachingLessonToolbarButton>
          {pageCount > 0 ? (
            <label className="flex items-center gap-1 text-xs tabular-nums" style={{ color: surface.panelMutedText }}>
              <span className="sr-only">{t("freeWritePdfGoToPage")}</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                inputMode="numeric"
                aria-label={t("freeWritePdfGoToPage")}
                className="w-14 rounded border px-1 py-0.5 text-center text-xs tabular-nums outline-none"
                style={{
                  borderColor: surface.panelBorder,
                  backgroundColor: surface.panelBg,
                  color: surface.panelText,
                }}
                value={pageDraft}
                onChange={(e) => setPageDraft(e.target.value)}
                onBlur={() => commitPageDraft()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitPageDraft();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <span>/ {pageCount}</span>
            </label>
          ) : (
            <span className="text-xs tabular-nums" style={{ color: surface.panelMutedText }}>
              —
            </span>
          )}
          <TeachingLessonToolbarButton
            label={t("freeWritePdfNextPage")}
            size="sm"
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
            size="sm"
            onClick={() =>
              setViewerZoom((z) => clampFreeWritePdfZoom(z - FREE_WRITE_ZOOM_STEP))
            }
            backgroundColor={surface.panelBg}
            borderColor={surface.panelBorder}
            color={surface.panelText}
          >
            <MdOutlineZoomOut className={TOOLBAR_ICON_CLASS} />
          </TeachingLessonToolbarButton>
          <span
            className="min-w-[3.25rem] text-center text-xs tabular-nums"
            style={{ color: surface.panelMutedText }}
          >
            {formatFreeWriteZoomPercent(viewerZoom)}
          </span>
          <TeachingLessonToolbarButton
            label={t("freeWriteZoomIn")}
            size="sm"
            onClick={() =>
              setViewerZoom((z) => clampFreeWritePdfZoom(z + FREE_WRITE_ZOOM_STEP))
            }
            backgroundColor={surface.panelBg}
            borderColor={surface.panelBorder}
            color={surface.panelText}
          >
            <MdOutlineZoomIn className={TOOLBAR_ICON_CLASS} />
          </TeachingLessonToolbarButton>

          <span className="mx-1 inline-block w-2 shrink-0" aria-hidden />

          {active ? (
            <>
              <TeachingLessonToolbarButton
                label={t("freeWritePdfUndo")}
                size="sm"
                onClick={() => undoAnnotation()}
                disabled={undoDepth <= 0}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <IoIosUndo className={TOOLBAR_ICON_CLASS} />
              </TeachingLessonToolbarButton>
              <TeachingLessonToolbarButton
                label={t("freeWritePdfRedo")}
                size="sm"
                onClick={() => redoAnnotation()}
                disabled={redoDepth <= 0}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <IoIosRedo className={TOOLBAR_ICON_CLASS} />
              </TeachingLessonToolbarButton>
              {toolBtn(
                "pen",
                t("freeWritePdfPen"),
                <IoPencilOutline className={TOOLBAR_ICON_CLASS} />,
              )}
              {toolBtn(
                "eraser",
                t("freeWritePdfEraser"),
                <PiEraserLight className={TOOLBAR_ICON_CLASS} />,
              )}
              {toolBtn(
                "text",
                t("freeWritePdfTextTool"),
                <TextToolIcon className={TOOLBAR_ICON_CLASS} />,
              )}
              <TeachingLessonToolbarButton
                label={t("freeWritePdfDeleteText")}
                size="sm"
                onClick={deleteSelectedText}
                disabled={!selectedTextId}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <TextSlashIcon className={TOOLBAR_ICON_CLASS} />
              </TeachingLessonToolbarButton>
              <TeachingLessonToolbarButton
                label={t("freeWritePdfClearAll")}
                size="sm"
                onClick={() => setClearConfirmOpen(true)}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <span className="text-xs font-medium">CLR</span>
              </TeachingLessonToolbarButton>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <TeachingLessonToolbarButton
            label={t("freeWriteOpenPdf")}
            size="sm"
            onClick={() => void pickTeachingPdf()}
            backgroundColor={surface.panelBg}
            borderColor={surface.panelBorder}
            color={surface.panelText}
          >
            <LoadSongIcon className={TOOLBAR_ICON_CLASS} />
          </TeachingLessonToolbarButton>
          {active ? (
            <>
              <TeachingLessonToolbarButton
                label={t("freeWritePdfExport")}
                size="sm"
                onClick={() => setExportOpen(true)}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <BiExport className={TOOLBAR_ICON_CLASS} />
              </TeachingLessonToolbarButton>
              <TeachingLessonToolbarButton
                label={t("freeWriteClosePdf")}
                size="sm"
                onClick={() => void closeTeachingPdf()}
                backgroundColor={surface.panelBg}
                borderColor={surface.panelBorder}
                color={surface.panelText}
              >
                <CloseIcon className={TOOLBAR_ICON_CLASS} />
              </TeachingLessonToolbarButton>
            </>
          ) : null}
        </div>
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

      <ConfirmDialog
        open={clearConfirmOpen}
        message={t("freeWritePdfClearAllConfirm")}
        confirmLabel={t("freeWritePdfClearAll")}
        cancelLabel={t("cancel")}
        onConfirm={() => {
          setClearConfirmOpen(false);
          void clearAll();
        }}
        onCancel={() => setClearConfirmOpen(false)}
        surface={surface}
      />
    </div>
  );
}
