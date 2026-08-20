import { useEffect, useRef } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { clampFreeWriteZoom } from "../../lib/teaching";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { TeachingLessonToolbarButton } from "./TeachingLessonPanel";

const BASE_FONT_PX = 16;

/** Notepad-like plain-text editor with zoom, wrap, and optional line numbers. */
export function FreeWriteNotepad() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const setFreeWriteFocus = useAppStore((s) => s.setFreeWriteFocus);
  const setFreeWriteNotepadText = useAppStore((s) => s.setFreeWriteNotepadText);
  const clearFreeWriteNotepad = useAppStore((s) => s.clearFreeWriteNotepad);
  const setFreeWriteNotepadZoom = useAppStore((s) => s.setFreeWriteNotepadZoom);
  const setFreeWriteNotepadWrap = useAppStore((s) => s.setFreeWriteNotepadWrap);
  const setFreeWriteNotepadLineNumbers = useAppStore((s) => s.setFreeWriteNotepadLineNumbers);

  const text = settings.freeWriteNotepadText ?? "";
  const zoom = clampFreeWriteZoom(settings.freeWriteNotepadZoom ?? 100);
  const wrap = settings.freeWriteNotepadWrap !== false;
  const lineNumbers = settings.freeWriteNotepadLineNumbers !== false;
  const surface = getSurfaceColors(settings.appBgColor);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = Math.max(1, text.split("\n").length);
  const fontSizePx = (BASE_FONT_PX * zoom) / 100;

  useEffect(() => {
    const body = bodyRef.current;
    const gutter = gutterRef.current;
    if (!body || !gutter) return;
    const sync = () => {
      gutter.scrollTop = body.scrollTop;
    };
    body.addEventListener("scroll", sync);
    return () => body.removeEventListener("scroll", sync);
  }, [lineNumbers]);

  const onClear = () => {
    if (!window.confirm(t("freeWriteClearConfirm"))) return;
    clearFreeWriteNotepad();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <span className="mr-auto text-sm font-medium" style={{ color: surface.panelText }}>
          {t("freeWriteNotepad")}
        </span>
        <TeachingLessonToolbarButton
          label={t("freeWriteZoomOut")}
          onClick={() => setFreeWriteNotepadZoom(zoom - 25)}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-lg leading-none">−</span>
        </TeachingLessonToolbarButton>
        <span className="min-w-[3rem] text-center text-xs" style={{ color: surface.panelMutedText }}>
          {zoom}%
        </span>
        <TeachingLessonToolbarButton
          label={t("freeWriteZoomIn")}
          onClick={() => setFreeWriteNotepadZoom(zoom + 25)}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-lg leading-none">+</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteWordWrap")}
          onClick={() => setFreeWriteNotepadWrap(!wrap)}
          backgroundColor={wrap ? "#fde68a" : surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-xs font-semibold">W</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteLineNumbers")}
          onClick={() => setFreeWriteNotepadLineNumbers(!lineNumbers)}
          backgroundColor={lineNumbers ? "#fde68a" : surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-xs font-semibold">#</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteClearAll")}
          onClick={onClear}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-xs font-semibold">⌫</span>
        </TeachingLessonToolbarButton>
      </div>

      <div
        className="flex min-h-0 flex-1 overflow-hidden rounded-md border"
        style={{ borderColor: surface.panelBorder, backgroundColor: surface.insetBg }}
        onPointerDown={() => setFreeWriteFocus("notepad")}
      >
        {lineNumbers ? (
          <div
            ref={gutterRef}
            className="shrink-0 overflow-hidden border-r px-1.5 py-2 text-right select-none"
            style={{
              borderColor: surface.panelBorder,
              color: surface.panelMutedText,
              fontSize: fontSizePx,
              lineHeight: 1.5,
              width: `${Math.max(2, String(lineCount).length) + 1}ch`,
            }}
            aria-hidden
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        ) : null}
        <textarea
          ref={bodyRef}
          className="h-full min-h-0 w-full flex-1 resize-none bg-transparent p-2 outline-none"
          style={{
            color: surface.panelText,
            fontSize: fontSizePx,
            lineHeight: 1.5,
            whiteSpace: wrap ? "pre-wrap" : "pre",
            overflowWrap: wrap ? "break-word" : "normal",
            overflowX: wrap ? "hidden" : "auto",
          }}
          value={text}
          placeholder={t("freeWriteNotepadEmpty")}
          spellCheck={false}
          onChange={(e) => setFreeWriteNotepadText(e.target.value)}
          onFocus={() => setFreeWriteFocus("notepad")}
        />
      </div>
    </div>
  );
}
