import { useEffect } from "react";
import { MicrophoneIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DictationVisualizer } from "./DictationVisualizer";
import { transparentKeyPalette, transparentOutlineStyle } from "../../lib/miniMode";

export function DictationButton({ transparentUi = false }: { transparentUi?: boolean }) {
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
  const captureAudio = sttCapability?.engine !== "groq";
  // Never disable while a session is active — stop must always be clickable.
  const disabled = !listening && !canDictate;
  const transparentPalette = transparentKeyPalette(settings.transparentKeyColor);

  useEffect(() => {
    void refreshSttCapability();
  }, [refreshSttCapability, settings.typingLanguage, settings.groqApiKey]);

  let label = listening ? t("dictationStop") : t("dictationStart");
  if (disabled) {
    if (!sttCapability?.online) {
      label = t("dictationUnavailableOffline");
    } else if (sttCapability && !sttCapability.winrtSupported) {
      label = t("dictationUnavailableUnsupported");
    } else {
      label = t("dictationUnavailableOffline");
    }
  }

  return (
    <>
      <DictationVisualizer active={listening} captureAudio={captureAudio} />
      <ModeToggleGroup
        transparentUi={transparentUi}
        transparentBorderColor={transparentPalette.border}
      >
        <ModeToggleButton
          active={listening}
          position="only"
          label={label}
          disabled={disabled}
          style={
            transparentUi
              ? transparentOutlineStyle({
                  active: listening,
                  color: transparentPalette.text,
                  outlineColor: settings.transparentKeyColor,
                })
              : undefined
          }
          activeClassName={
            transparentUi
              ? "bg-transparent"
              : listening
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
