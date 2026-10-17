import { Activity, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SurfaceColors } from "../../lib/colorProfiles";
import {
  normalizeExportPageRange,
  rangeForAllPages,
  rangeForCurrentPage,
} from "../../lib/teaching";
import { useTranslation } from "../../hooks/useTranslation";

export type FreeWritePdfExportDialogProps = {
  open: boolean;
  pageCount: number;
  currentPage: number;
  surface: SurfaceColors;
  onCancel: () => void;
  onExport: (from: number, to: number) => void;
};

/** From/To/All/Current export range dialog for Free write PDF. */
export function FreeWritePdfExportDialog({
  open,
  pageCount,
  currentPage,
  surface,
  onCancel,
  onExport,
}: FreeWritePdfExportDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const all = rangeForAllPages(Math.max(1, pageCount));
    setFrom(all.from);
    setTo(all.to);
    setError(null);
  }, [open, pageCount]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstInput = panel.querySelector<HTMLElement>("input, button");
    firstInput?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open, onCancel]);

  const panelStyle: CSSProperties = {
    backgroundColor: surface.panelBg,
    border: `1px solid ${surface.panelBorder}`,
    color: surface.panelText,
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
  };

  const fieldStyle: CSSProperties = {
    backgroundColor: surface.insetBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  const buttonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  const primaryStyle: CSSProperties = {
    backgroundColor: surface.panelHeaderBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  const applyAll = () => {
    const all = rangeForAllPages(Math.max(1, pageCount));
    setFrom(all.from);
    setTo(all.to);
    setError(null);
  };

  const applyCurrent = () => {
    const result = rangeForCurrentPage(currentPage, Math.max(1, pageCount));
    if ("error" in result) {
      setError(result.error || t("freeWritePdfExportInvalidRange"));
      return;
    }
    setFrom(result.from);
    setTo(result.to);
    setError(null);
  };

  const submit = () => {
    const result = normalizeExportPageRange({
      from,
      to,
      pageCount: Math.max(1, pageCount),
    });
    if ("error" in result) {
      setError(result.error || t("freeWritePdfExportInvalidRange"));
      return;
    }
    setError(null);
    onExport(result.from, result.to);
  };

  return (
    <Activity mode={open ? "visible" : "hidden"}>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="w-full max-w-sm rounded-2xl p-5 outline-none"
          style={panelStyle}
        >
          <p
            id={titleId}
            className="text-base font-medium"
            style={{ color: surface.panelText }}
          >
            {t("freeWritePdfExport")}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: surface.panelMutedText }}>
                {t("freeWritePdfExportFrom")}
              </span>
              <input
                type="number"
                min={1}
                max={pageCount || 1}
                value={from}
                onChange={(e) => setFrom(Number(e.target.value) || 1)}
                className="min-h-11 rounded-lg border px-3 py-2"
                style={fieldStyle}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: surface.panelMutedText }}>
                {t("freeWritePdfExportTo")}
              </span>
              <input
                type="number"
                min={1}
                max={pageCount || 1}
                value={to}
                onChange={(e) => setTo(Number(e.target.value) || 1)}
                className="min-h-11 rounded-lg border px-3 py-2"
                style={fieldStyle}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium"
              style={buttonStyle}
              onClick={applyAll}
            >
              {t("freeWritePdfExportAll")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium"
              style={buttonStyle}
              onClick={applyCurrent}
            >
              {t("freeWritePdfExportCurrent")}
            </button>
          </div>

          {error ? (
            <p className="mt-3 text-sm" style={{ color: "#b91c1c" }} role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="min-h-11 min-w-[5.5rem] rounded-lg border px-4 py-2.5 text-sm font-medium"
              style={buttonStyle}
              onClick={onCancel}
            >
              {t("freeWritePdfExportCancel")}
            </button>
            <button
              type="button"
              className="min-h-11 min-w-[5.5rem] rounded-lg border px-4 py-2.5 text-sm font-medium"
              style={primaryStyle}
              onClick={submit}
            >
              {t("freeWritePdfExportSave")}
            </button>
          </div>
        </div>
      </div>
    </Activity>
  );
}
