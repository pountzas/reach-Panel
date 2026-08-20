import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { isTransparentUiActive, transparentKeyPalette, transparentOutlineStyle } from "../../lib/miniMode";

const PREVIEW_MAX_WIDTH = 320;
const PREVIEW_HEIGHT_PX = 48;

export function InputPreview() {
  const inputPreviewFrame = useAppStore((s) => s.inputPreviewFrame);
  const settings = useAppStore((s) => s.settings);
  const miniModeActive = useAppStore((s) => s.miniModeActive);
  const { t } = useTranslation();
  const transparent = isTransparentUiActive(settings, miniModeActive);
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);
  const frameStyle = transparent
    ? transparentOutlineStyle({
        color: transparentPalette.text,
        outlineColor: settings.transparentKeyColor,
      })
    : {
        borderColor: "#94a3b8",
        backgroundColor: "#0f172a",
      };

  return (
    <div
      className="flex w-full max-w-[min(100%,22rem)] shrink-0 justify-center"
      aria-live="polite"
    >
      <div
        className="flex w-full items-center justify-center overflow-hidden rounded-md border"
        style={{
          ...frameStyle,
          maxWidth: PREVIEW_MAX_WIDTH,
          height: PREVIEW_HEIGHT_PX,
        }}
        aria-label={t("inputPreviewLabel")}
      >
        {inputPreviewFrame ? (
          <img
            src={inputPreviewFrame}
            alt={t("inputPreviewLabel")}
            className="block h-full w-full object-contain object-left"
            draggable={false}
          />
        ) : (
          <span
            className={`px-3 text-xs ${transparent ? "" : "text-slate-400"}`}
            style={transparent ? { color: transparentPalette.text, opacity: 0.85 } : undefined}
          >
            {t("inputPreviewWaiting")}
          </span>
        )}
      </div>
    </div>
  );
}