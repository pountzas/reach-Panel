import { KeyboardIcon, SynthesizerIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { SuggestionsBar } from "../common/SuggestionsBar";
import { SynthVolumeControl } from "./SynthVolumeControl";
import { DictationButton } from "./DictationButton";
import { KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS } from "../../lib/buttonClasses";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";

export function KeyboardSection() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const showSynth = settings.keyboardSectionMode === "synthesizer";
  const compact = settings.inputAreaCompact;
  const showToggle = settings.keyboardModeToggleVisible && !compact;
  const showDictation =
    !showSynth && settings.dictationVisible !== false && !compact;
  const showSuggestions = !showSynth && settings.suggestionsVisible && !compact;
  const showToolbar = showDictation || showToggle || showSuggestions;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToolbar && (
        <div
          className={`relative z-20 flex items-center justify-between gap-2 overflow-visible pr-1 ${compact ? "pt-2" : "pt-6"}`}
        >
          <div className="min-w-0 flex-1 pl-1.5">
            {showSuggestions && <SuggestionsBar />}
          </div>
          {(showDictation || showToggle) && (
            <div
              className={`flex ${KEYBOARD_TOOLBAR_CONTROL_HEIGHT_CLASS} shrink-0 items-center gap-2 pr-2`}
            >
              {showDictation && <DictationButton />}
              {showSynth && showToggle && (
                <SynthVolumeControl
                  volume={settings.synthesizerVolume ?? 70}
                  muted={settings.synthesizerMuted ?? false}
                  onVolumeChange={(synthesizerVolume) => updateSettings({ synthesizerVolume })}
                  onMutedChange={(synthesizerMuted) => updateSettings({ synthesizerMuted })}
                />
              )}
              {showToggle && (
                <ModeToggleGroup>
                  <ModeToggleButton
                    active={!showSynth}
                    position="first"
                    label={t("keyboard")}
                    onClick={() => updateSettings({ keyboardSectionMode: "keyboard" })}
                  >
                    <KeyboardIcon className="h-4 w-4" />
                  </ModeToggleButton>
                  <ModeToggleButton
                    active={showSynth}
                    position="last"
                    label={t("synthesizer")}
                    onClick={() => updateSettings({ keyboardSectionMode: "synthesizer" })}
                  >
                    <SynthesizerIcon className="h-4 w-4" />
                  </ModeToggleButton>
                </ModeToggleGroup>
              )}
            </div>
          )}
        </div>
      )}
      {showSynth ? (
        <div className="min-h-0 flex-1">
          <Synthesizer />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Keyboard />
        </div>
      )}
    </div>
  );
}
