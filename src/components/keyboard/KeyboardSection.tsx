import { KeyboardIcon, SynthesizerIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { SynthVolumeControl } from "./SynthVolumeControl";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { Keyboard } from "./Keyboard";
import { Synthesizer } from "./Synthesizer";

export function KeyboardSection() {
  const { settings, updateSettings } = useAppStore();
  const { t } = useTranslation();
  const showSynth = settings.keyboardSectionMode === "synthesizer";
  const showToggle = settings.keyboardModeToggleVisible;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {showToggle && (
        <div className="relative z-20 mb-1 flex items-end justify-end gap-2 overflow-visible pr-1 pt-6">
          {showSynth && (
            <SynthVolumeControl
              volume={settings.synthesizerVolume ?? 70}
              muted={settings.synthesizerMuted ?? false}
              onVolumeChange={(synthesizerVolume) => updateSettings({ synthesizerVolume })}
              onMutedChange={(synthesizerMuted) => updateSettings({ synthesizerMuted })}
            />
          )}
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
