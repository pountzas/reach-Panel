import { useLayoutEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import {
  isTransparentUiActive,
  transparentKeyPalette,
  transparentOutlineStyle,
} from "../../lib/focusMode";

const PREVIEW_MAX_WIDTH = 320;
const PREVIEW_HEIGHT_PX = 48;

function jpegObjectUrl(bytes: Uint8Array): string {
  // Fresh ArrayBuffer so BlobPart typing accepts the payload (no SharedArrayBuffer).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return URL.createObjectURL(new Blob([ab], { type: "image/jpeg" }));
}

export function InputPreview() {
  const inputPreviewFrame = useAppStore((s) => s.inputPreviewFrame);
  const focused = useAppStore((s) => s.externalInputFocused);
  const focusModeActive = useAppStore((s) => s.focusModeActive);
  const { focusModeTransparent, transparentKeyColor } = useAppStore(
    useShallow((s) => ({
      focusModeTransparent: s.settings.focusModeTransparent,
      transparentKeyColor: s.settings.transparentKeyColor,
    })),
  );
  const { t } = useTranslation();

  // Minimal bridge (#314): object URL from JPEG bytes. #315 may switch to ImageBitmap.
  const frameSrc = useMemo(() => {
    if (!inputPreviewFrame) {
      return null;
    }
    return jpegObjectUrl(inputPreviewFrame.bytes);
  }, [inputPreviewFrame]);

  useLayoutEffect(() => {
    if (!frameSrc) {
      return;
    }
    return () => {
      URL.revokeObjectURL(frameSrc);
    };
  }, [frameSrc]);

  const transparent = isTransparentUiActive(
    { focusModeTransparent },
    focusModeActive,
  );
  const transparentPalette = transparentKeyPalette(transparentKeyColor);
  const frameStyle = transparent
    ? transparentOutlineStyle({
        color: transparentPalette.text,
        outlineColor: transparentKeyColor,
      })
    : {
        borderColor: "#94a3b8",
        backgroundColor: "#0f172a",
      };

  return (
    <div
      className="flex pb-1 w-full max-w-[min(100%,20rem)] shrink-0 justify-center"
      aria-live="polite">
      <div
        className="flex items-center justify-center overflow-hidden rounded-md border"
        style={{
          ...frameStyle,
          width: PREVIEW_MAX_WIDTH,
          maxWidth: "100%",
          height: PREVIEW_HEIGHT_PX,
        }}
        role="status"
        aria-label={
          focused ? t("inputPreviewLabel") : t("inputPreviewNoInput")
        }>
        {focused && frameSrc ? (
          <img
            src={frameSrc}
            alt={t("inputPreviewLabel")}
            className="block h-full w-full object-contain object-center"
            draggable={false}
          />
        ) : focused && !frameSrc ? (
          <span
            className={`px-3 text-xs ${transparent ? "" : "text-slate-400"}`}
            style={
              transparent
                ? { color: transparentPalette.text, opacity: 0.85 }
                : undefined
            }>
            {t("inputPreviewWaiting")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
