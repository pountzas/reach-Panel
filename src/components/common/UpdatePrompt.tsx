import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { useTranslation } from "../../hooks/useTranslation";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { notify } from "../../lib/notify";
import {
  getCurrentAppVersion,
  installUpdate,
  skipUpdateVersion,
  type UpdateProgress,
} from "../../lib/updater";
import { useAppStore } from "../../stores/appStore";

type PromptState = "prompt" | "downloading";

interface UpdatePromptProps {
  update: Update;
  onDismiss: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatProgress(progress: UpdateProgress): number {
  if (!progress.contentLength || progress.contentLength <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100));
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

export function UpdatePrompt({ update, onDismiss }: UpdatePromptProps) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const surface = getSurfaceColors(settings.appBgColor);
  const headerBg = settings.headerBgColor ?? "#1e293b";
  const headerText = settings.headerTextColor ?? "#ffffff";
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PromptState>("prompt");
  const [currentVersion, setCurrentVersion] = useState("");
  const [progress, setProgress] = useState<UpdateProgress>({
    downloaded: 0,
    contentLength: null,
  });

  useEffect(() => {
    void getCurrentAppVersion().then(setCurrentVersion);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableElements(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (state === "downloading") return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableElements(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
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
      previouslyFocused?.focus?.();
    };
  }, [onDismiss, state]);

  const handleInstall = useCallback(async () => {
    setState("downloading");
    try {
      await installUpdate(update, setProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify.error(`${t("updateFailed")} ${message}`);
      setState("prompt");
      setProgress({ downloaded: 0, contentLength: null });
    }
  }, [t, update]);

  const handleSkip = useCallback(() => {
    skipUpdateVersion(update.version);
    onDismiss();
  }, [onDismiss, update.version]);

  const progressPercent = formatProgress(progress);

  const panelStyle: CSSProperties = {
    backgroundColor: surface.panelBg,
    border: `1px solid ${surface.panelBorder}`,
    color: surface.panelText,
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
  };

  const secondaryButtonStyle: CSSProperties = {
    backgroundColor: surface.panelButtonBg,
    borderColor: surface.panelBorder,
    color: surface.panelText,
  };

  const primaryButtonStyle: CSSProperties = {
    backgroundColor: headerBg,
    color: headerText,
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl p-5 outline-none"
        style={panelStyle}
      >
        <h2
          id={titleId}
          className="text-lg font-bold"
          style={{ color: surface.panelText }}
        >
          {t("updateAvailable")}
        </h2>

        {state === "prompt" && (
          <>
            <p className="mt-2 text-sm" style={{ color: surface.panelMutedText }}>
              {t("updateVersionInfo")}{" "}
              <span className="font-medium" style={{ color: surface.panelText }}>
                {currentVersion || "…"} → {update.version}
              </span>
            </p>
            {update.body && (
              <div
                className="mt-3 max-h-32 overflow-y-auto rounded-lg p-3 text-sm whitespace-pre-wrap"
                style={{
                  backgroundColor: surface.insetBg,
                  border: `1px solid ${surface.insetBorder}`,
                  color: surface.insetText,
                }}
              >
                {update.body}
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                style={secondaryButtonStyle}
                onClick={onDismiss}
              >
                {t("updateLater")}
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-sm"
                style={secondaryButtonStyle}
                onClick={handleSkip}
              >
                {t("skipThisVersion")}
              </button>
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={primaryButtonStyle}
                onClick={() => void handleInstall()}
              >
                {t("updateNow")}
              </button>
            </div>
          </>
        )}

        {state === "downloading" && (
          <div className="mt-4">
            <p className="text-sm" style={{ color: surface.panelMutedText }}>
              {t("updateDownloading")}
            </p>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: surface.insetBg }}
            >
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: headerBg,
                }}
              />
            </div>
            <p className="mt-2 text-xs" style={{ color: surface.panelMutedText }}>
              {progressPercent > 0 ? `${progressPercent}%` : t("updatePreparing")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
