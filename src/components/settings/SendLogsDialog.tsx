import type { SurfaceColors } from "../../lib/colorProfiles";
import {
  formatBundleSize,
  type DiagnosticsBundleFile,
} from "../../lib/sendDiagnostics";
import { Activity, useEffect, useId, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const MAX_NOTE_CHARS = 1000;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.getClientRects().length > 0);
}

export type SendLogsDialogProps = {
  cancelLabel: string;
  copyIdLabel: string;
  destination: string;
  errorMessage: string | null;
  files: DiagnosticsBundleFile[];
  note: string;
  noteHint: string;
  noteLabel: string;
  onCancel: () => void;
  onCopyId: () => void;
  onNoteChange: (value: string) => void;
  onOpenLogs: () => void;
  onSend: () => void;
  open: boolean;
  openLogsLabel: string;
  privacyTyped: string;
  privacyUsername: string;
  reportId: string | null;
  sendLabel: string;
  sending: boolean;
  sendingLabel: string;
  successTitle: string;
  surface: SurfaceColors;
  title: string;
};

export function SendLogsDialog({
  cancelLabel,
  copyIdLabel,
  destination,
  errorMessage,
  files,
  note,
  noteHint,
  noteLabel,
  onCancel,
  onCopyId,
  onNoteChange,
  onOpenLogs,
  onSend,
  open,
  openLogsLabel,
  privacyTyped,
  privacyUsername,
  reportId,
  sendLabel,
  sending,
  sendingLabel,
  successTitle,
  surface,
  title,
}: SendLogsDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const initial = focusableElements(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableElements(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [open]);

  const panelStyle: CSSProperties = {
    backgroundColor: surface.panelBg,
    border: `1px solid ${surface.panelBorder}`,
    color: surface.panelText,
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
  };
  const cancelButtonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };
  const confirmButtonStyle: CSSProperties = {
    backgroundColor: surface.panelText,
    borderColor: surface.panelText,
    color: surface.panelBg,
  };
  const muted = { color: surface.panelMutedText };

  return createPortal(
    <Activity mode={open ? "visible" : "hidden"}>
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="w-full max-w-md rounded-2xl p-5 outline-none"
          ref={panelRef}
          role="dialog"
          style={panelStyle}
          tabIndex={-1}>
          {reportId ? (
            <>
              <p
                id={titleId}
                className="text-base font-medium"
                style={{ color: surface.panelText }}>
                {successTitle}
              </p>
              <p className="mt-3 font-mono text-lg tracking-wide">{reportId}</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="min-h-11 min-w-22 rounded-lg border px-4 py-2.5 text-sm font-medium"
                  style={cancelButtonStyle}
                  onClick={onCancel}>
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  className="min-h-11 min-w-22 rounded-lg border px-4 py-2.5 text-sm font-medium"
                  style={confirmButtonStyle}
                  onClick={onCopyId}>
                  {copyIdLabel}
                </button>
              </div>
            </>
          ) : (
            <>
              <p
                id={titleId}
                className="text-base font-medium"
                style={{ color: surface.panelText }}>
                {title}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {files.map((file) => (
                  <li key={file.name} className="flex justify-between gap-3">
                    <span>{file.name}</span>
                    <span style={muted}>{formatBundleSize(file.size)}</span>
                  </li>
                ))}
              </ul>
              <ul
                className="mt-3 list-disc space-y-1 pl-5 text-sm"
                style={muted}>
                <li>{privacyTyped}</li>
                <li>{privacyUsername}</li>
                <li>{destination}</li>
              </ul>
              <label className="mt-4 block text-sm font-medium">
                {noteLabel}
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2 text-sm"
                  maxLength={MAX_NOTE_CHARS}
                  onChange={(event) => {
                    onNoteChange(event.target.value);
                  }}
                  style={{
                    backgroundColor: surface.insetBg,
                    borderColor: surface.panelBorder,
                    color: surface.panelText,
                  }}
                  value={note}
                />
              </label>
              <p className="mt-1 text-xs" style={muted}>
                {noteHint}
              </p>
              {errorMessage ? (
                <p className="mt-3 text-sm text-red-700">{errorMessage}</p>
              ) : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="min-h-11 min-w-22 rounded-lg border px-4 py-2.5 text-sm font-medium"
                  style={cancelButtonStyle}
                  onClick={onCancel}>
                  {cancelLabel}
                </button>
                {errorMessage ? (
                  <button
                    type="button"
                    className="min-h-11 min-w-22 rounded-lg border px-4 py-2.5 text-sm font-medium"
                    style={cancelButtonStyle}
                    onClick={onOpenLogs}>
                    {openLogsLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-11 min-w-22 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                  disabled={sending}
                  style={confirmButtonStyle}
                  onClick={onSend}>
                  {sending ? sendingLabel : sendLabel}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Activity>,
    document.body,
  );
}
