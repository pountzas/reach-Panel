import { MuteIcon, VolumeIcon } from "../common/SectionIcons";
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
      <button
        type="button"
        className={`group relative flex shrink-0 items-center justify-center rounded border border-slate-300 p-2 ${muted ? "bg-slate-700 text-white" : "bg-white text-slate-700"}`}
        onClick={() => onMutedChange(!muted)}
        aria-pressed={muted}
        aria-label={muted ? t("unmute") : t("mute")}
      >
        {muted ? <MuteIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          {muted ? t("unmute") : t("mute")}
        </span>
      </button>
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
