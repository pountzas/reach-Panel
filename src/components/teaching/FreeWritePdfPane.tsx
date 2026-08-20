import { invoke } from "@tauri-apps/api/core";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useMemo, useState } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { sortTeachingPdfEntriesByRecent } from "../../lib/teaching";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { TeachingLessonToolbarButton } from "./TeachingLessonPanel";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

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
  const openTeachingPdf = useAppStore((s) => s.openTeachingPdf);
  const removeTeachingPdf = useAppStore((s) => s.removeTeachingPdf);
  const setFreeWriteFocus = useAppStore((s) => s.setFreeWriteFocus);

  const surface = getSurfaceColors(settings.appBgColor);
  const recent = useMemo(
    () => sortTeachingPdfEntriesByRecent(teachingPdfLibrary),
    [teachingPdfLibrary],
  );
  const active = recent.find((e) => e.id === freeWriteActivePdfId) ?? null;

  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [viewerZoom, setViewerZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void loadTeachingPdfLibrary();
  }, [loadTeachingPdfLibrary]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setPageCount(0);
      if (!active || !canvasEl) return;
      try {
        const payload = await invoke<PdfPayload>("cmd_read_teaching_pdf", {
          path: active.path,
        });
        if (cancelled) return;
        const data = base64ToUint8Array(payload.contentBase64);
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const pageNum = Math.min(Math.max(1, page), doc.numPages);
        if (pageNum !== page) {
          setPage(pageNum);
          return;
        }
        const pdfPage = await doc.getPage(pageNum);
        const viewport = pdfPage.getViewport({ scale: viewerZoom / 100 });
        const context = canvasEl.getContext("2d");
        if (!context) return;
        canvasEl.width = viewport.width;
        canvasEl.height = viewport.height;
        await pdfPage.render({ canvasContext: context, viewport, canvas: canvasEl }).promise;
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message || t("freeWritePdfMissing"));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [active, canvasEl, page, viewerZoom, t]);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      onPointerDown={() => setFreeWriteFocus("pdf")}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <button
          type="button"
          className="h-10 rounded-md border px-3 text-sm font-medium"
          style={{
            borderColor: surface.panelBorder,
            backgroundColor: surface.panelBg,
            color: surface.panelText,
          }}
          onClick={() => void pickTeachingPdf()}
        >
          {t("freeWriteOpenPdf")}
        </button>
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
      </div>

      {recent.length > 0 ? (
        <div className="shrink-0">
          <div className="mb-1 text-xs" style={{ color: surface.panelMutedText }}>
            {t("freeWriteRecentPdfs")}
          </div>
          <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
            {recent.map((entry) => {
              const selected = entry.id === freeWriteActivePdfId;
              return (
                <div key={entry.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded border px-2 py-1 text-left text-xs"
                    style={{
                      borderColor: surface.panelBorder,
                      backgroundColor: selected ? "#fde68a" : surface.panelBg,
                      color: surface.panelText,
                    }}
                    onClick={() => {
                      setPage(1);
                      void openTeachingPdf(entry.id);
                    }}
                    title={entry.path}
                  >
                    {entry.title}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded border px-2 py-1 text-xs"
                    style={{
                      borderColor: surface.panelBorder,
                      backgroundColor: surface.panelBg,
                      color: surface.panelMutedText,
                    }}
                    onClick={() => void removeTeachingPdf(entry.id)}
                  >
                    {t("freeWriteRemovePdf")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

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
            {active ? (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                style={{
                  borderColor: surface.panelBorder,
                  backgroundColor: surface.panelBg,
                  color: surface.panelText,
                }}
                onClick={() => void removeTeachingPdf(active.id)}
              >
                {t("freeWriteRemovePdf")}
              </button>
            ) : null}
          </div>
        ) : !active ? (
          <p className="text-sm" style={{ color: surface.panelMutedText }}>
            {t("freeWritePdfEmpty")}
          </p>
        ) : (
          <canvas ref={setCanvasEl} className="mx-auto block max-w-full" />
        )}
      </div>
    </div>
  );
}
