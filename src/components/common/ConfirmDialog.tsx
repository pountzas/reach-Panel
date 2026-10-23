import type { SurfaceColors } from "../../lib/colorProfiles";
import { Activity, useEffect, useId, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export type ConfirmDialogProps = {
  cancelLabel: string;
  confirmBackgroundColor?: string;
  confirmLabel: string;
  confirmTextColor?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  surface: SurfaceColors;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.getClientRects().length > 0);
}

/** Centered, themed confirmation overlay for destructive or irreversible actions. */
export function ConfirmDialog({
  cancelLabel,
  confirmBackgroundColor,
  confirmLabel,
  confirmTextColor,
  message,
  onCancel,
  onConfirm,
  open,
  surface,
}: ConfirmDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

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
        onCancel();
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
  }, [open, onCancel]);

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
    backgroundColor: confirmBackgroundColor ?? "#b91c1c",
    borderColor: confirmBackgroundColor ?? "#b91c1c",
    color: confirmTextColor ?? "#ffffff",
  };

  // Portal to body so `contain: layout paint` on Docked/Floating sections
  // cannot trap or clip this fixed overlay.
  return createPortal(
    <Activity mode={open ? "visible" : "hidden"}>
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="w-full max-w-sm rounded-2xl p-5 outline-none"
          ref={panelRef}
          role="dialog"
          style={panelStyle}>
          tabIndex={-1}
          <p
            id={titleId}
            className="text-base font-medium"
            style={{ color: surface.panelText }}>
            {message}
          </p>
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
              onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Activity>,
    document.body,
  );
}
