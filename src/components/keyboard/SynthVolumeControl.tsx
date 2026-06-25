import { MuteIcon, VolumeIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useTranslation } from "../../hooks/useTranslation";

interface SynthVolumeControlProps {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onMutedChange: (muted: boolean) => void;
}

export function SynthVolumeControl({
  volume,
  muted,
  onVolumeChange,
  onMutedChange,
}: SynthVolumeControlProps) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2 px-4">
      <ModeToggleGroup>
        <ModeToggleButton
          active={muted}
          position="only"
          label={muted ? t("unmute") : t("mute")}
          onClick={() => onMutedChange(!muted)}
        >
          {muted ? <MuteIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
        </ModeToggleButton>
      </ModeToggleGroup>
      <label className="sr-only" htmlFor="synthesizer-volume-slider">
        {t("synthesizerVolume")}
      </label>
      <input
        id="synthesizer-volume-slider"
        type="range"
        className="mouse-speed-slider min-w-0 w-full max-w-[100px]"
        min={0}
        max={100}
        step={1}
        value={volume}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={volume}
        aria-valuetext={`${volume}%`}
        title={`${t("synthesizerVolume")}: ${volume}%`}
      />
    </div>
  );
}
