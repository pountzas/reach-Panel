import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { TeachingLessonToolbarButton } from "./TeachingLessonPanel";

/** Full-width Language tab: school books overlay hosted in the teaching panel. */
export function SchoolBooksPanel() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const openTeachingEbook = useAppStore((s) => s.openTeachingEbook);
  const teachingEbookHome = useAppStore((s) => s.teachingEbookHome);
  const teachingEbookBack = useAppStore((s) => s.teachingEbookBack);
  const teachingEbookReload = useAppStore((s) => s.teachingEbookReload);
  const hideTeachingEbook = useAppStore((s) => s.hideTeachingEbook);
  const syncTeachingEbookBounds = useAppStore((s) => s.syncTeachingEbookBounds);
  const teachingEbookWindowOpen = useAppStore((s) => s.teachingEbookWindowOpen);

  const surface = getSurfaceColors(settings.appBgColor);
  const hostRef = useRef<HTMLDivElement>(null);

  const publishBounds = useCallback(async () => {
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    try {
      const win = getCurrentWindow();
      const scale = await win.scaleFactor();
      const inner = await win.innerPosition();
      const x = inner.x / scale + rect.left;
      const y = inner.y / scale + rect.top;
      await syncTeachingEbookBounds({
        x,
        y,
        width: rect.width,
        height: rect.height,
      });
    } catch {
      // Ignore while the overlay is not ready.
    }
  }, [syncTeachingEbookBounds]);

  useEffect(() => {
    void openTeachingEbook();
    return () => {
      void hideTeachingEbook();
    };
  }, [hideTeachingEbook, openTeachingEbook]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    void publishBounds();
    const ro = new ResizeObserver(() => {
      void publishBounds();
    });
    ro.observe(el);
    window.addEventListener("resize", publishBounds);
    const interval = window.setInterval(() => {
      void publishBounds();
    }, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publishBounds);
      window.clearInterval(interval);
    };
  }, [publishBounds, teachingEbookWindowOpen]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-1">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <span className="mr-auto text-sm font-medium" style={{ color: surface.panelText }}>
          {t("teachingTabSchoolBooks")}
        </span>
        <TeachingLessonToolbarButton
          label={t("freeWriteEbookHome")}
          onClick={() => void teachingEbookHome()}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-xs font-semibold">⌂</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteEbookBack")}
          onClick={() => void teachingEbookBack()}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-sm">◀</span>
        </TeachingLessonToolbarButton>
        <TeachingLessonToolbarButton
          label={t("freeWriteEbookReload")}
          onClick={() => void teachingEbookReload()}
          backgroundColor={surface.panelBg}
          borderColor={surface.panelBorder}
          color={surface.panelText}
        >
          <span className="text-xs font-semibold">↻</span>
        </TeachingLessonToolbarButton>
      </div>

      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-md border"
        style={{ borderColor: surface.panelBorder, backgroundColor: surface.insetBg }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <p className="max-w-md text-center text-sm" style={{ color: surface.panelMutedText }}>
            {t("freeWriteEbookHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
