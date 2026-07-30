import { useEffect } from "react";
import { MicrophoneIcon } from "../common/SectionIcons";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

const FAB_SIZE = 56;
const FAB_GAP = 12;
/** Must stay in sync with COLLAPSED_PAD in src-tauri/src/window/mod.rs */
const FAB_PAD = 10;

export function CollapsedFab() {
  const {
    settings,
    toggleCollapsed,
    isAnimatingWindow,
    dictationState,
    toggleDictation,
    sttCapability,
    refreshSttCapability,
  } = useAppStore();
  const { t } = useTranslation();

  const bgColor = settings.headerBgColor ?? "#1e293b";
  const textColor = settings.headerTextColor ?? "#ffffff";
  const showDictation = settings.dictationVisible !== false;
  const listening = dictationState === "listening" || dictationState === "processing";
  const canDictate = sttCapability?.canDictate ?? false;
  const dictationDisabled = !listening && !canDictate;

  useEffect(() => {
    void refreshSttCapability();
  }, [refreshSttCapability, settings.typingLanguage, settings.groqApiKey]);

  let dictationLabel = listening ? t("dictationStop") : t("dictationStart");
  if (dictationDisabled) {
    if (!sttCapability?.online) {
      dictationLabel = t("dictationUnavailableOffline");
    } else if (sttCapability && !sttCapability.winrtSupported) {
      dictationLabel = t("dictationUnavailableUnsupported");
    } else {
      dictationLabel = t("dictationUnavailableOffline");
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center"
      style={{ background: "transparent", gap: FAB_GAP, padding: FAB_PAD }}
    >
      {showDictation && (
        <button
          type="button"
          className="flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            backgroundColor: listening
              ? "#dc2626"
              : dictationDisabled
                ? "#94a3b8"
                : "#2563eb",
            color: "#ffffff",
          }}
          onClick={() => void toggleDictation()}
          disabled={dictationDisabled}
          aria-label={dictationLabel}
        >
          <MicrophoneIcon className="h-6 w-6" />
        </button>
      )}
      <button
        type="button"
        className="flex items-center justify-center rounded-full font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          backgroundColor: bgColor,
          color: textColor,
          fontSize: 22,
        }}
        onClick={toggleCollapsed}
        disabled={isAnimatingWindow}
        aria-label={t("expand")}
      >
        R
      </button>
    </div>
  );
}
