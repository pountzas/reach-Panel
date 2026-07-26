import { useEffect } from "react";
import { MicrophoneIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DictationVisualizer } from "./DictationVisualizer";

export function DictationButton() {
  const {
    dictationState,
    toggleDictation,
    sttCapability,
    refreshSttCapability,
    settings,
  } = useAppStore();
  const { t } = useTranslation();
  const listening = dictationState === "listening" || dictationState === "processing";
  const canDictate = sttCapability?.canDictate ?? false;
  const downloading = sttCapability?.whisperDownloading ?? false;
  const disabled = !listening && !canDictate;

  useEffect(() => {
    void refreshSttCapability();
  }, [refreshSttCapability, settings.typingLanguage]);

  let label = listening ? t("dictationStop") : t("dictationStart");
  if (disabled) {
    if (downloading) {
      label = t("dictationDownloadingModel");
    } else if (sttCapability && !sttCapability.winrtSupported) {
      label = t("dictationUnavailableUnsupported");
    } else {
      label = t("dictationUnavailableOffline");
    }
  }

  return (
    <>
      <DictationVisualizer active={listening} />
      <ModeToggleGroup>
        <ModeToggleButton
          active={listening}
          position="only"
          label={label}
          disabled={disabled}
          activeClassName={
            listening
              ? "bg-red-600 text-white"
              : disabled
                ? "bg-slate-100 text-slate-400"
                : "bg-white text-slate-700"
          }
          onClick={() => void toggleDictation()}
        >
          <MicrophoneIcon className="h-4 w-4" />
        </ModeToggleButton>
      </ModeToggleGroup>
    </>
  );
}
