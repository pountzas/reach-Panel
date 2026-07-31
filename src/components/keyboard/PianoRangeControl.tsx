import {
  SYNTH_MAX_START_OCTAVE,
  SYNTH_MIN_START_OCTAVE,
  SYNTH_OCTAVE_COUNTS,
  pianoRangeLabel,
  resolveSynthOctaveCount,
  resolveSynthStartOctave,
  type SynthOctaveCount,
} from "../../lib/music/octaveCount";
import { modeToggleSegmentPosition } from "../../lib/buttonClasses";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useTranslation } from "../../hooks/useTranslation";

interface PianoRangeControlProps {
  octaveCount: number | undefined;
  startOctave: number | undefined;
  onOctaveCountChange: (count: SynthOctaveCount) => void;
  onStartOctaveChange: (startOctave: number) => void;
  /** Optional song range label, e.g. "F1–C#6". */
  songRangeLabel?: string | null;
}

export function PianoRangeControl({
  octaveCount: octaveCountValue,
  startOctave: startOctaveValue,
  onOctaveCountChange,
  onStartOctaveChange,
  songRangeLabel,
}: PianoRangeControlProps) {
  const { t } = useTranslation();
  const octaveCount = resolveSynthOctaveCount(octaveCountValue);
  const startOctave = resolveSynthStartOctave(startOctaveValue, octaveCount);
  const range = pianoRangeLabel(startOctave, octaveCount);
  const canShiftDown = startOctave > SYNTH_MIN_START_OCTAVE;
  const canShiftUp = startOctave < SYNTH_MAX_START_OCTAVE;

  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5">
      <ModeToggleGroup>
        <ModeToggleButton
          active={false}
          position="first"
          label={t("shiftPianoLower")}
          onClick={() => onStartOctaveChange(startOctave - 1)}
          disabled={!canShiftDown}
        >
          <span className="text-xs font-semibold">◀</span>
        </ModeToggleButton>
        <ModeToggleButton
          active
          position="middle"
          label={
            songRangeLabel
              ? `${t("pianoRange")}: ${range} (${t("songRange")}: ${songRangeLabel})`
              : `${t("pianoRange")}: ${range}`
          }
          onClick={() => undefined}
          disabled
        >
          <span className="px-0.5 text-[10px] font-semibold tabular-nums leading-none">
            {range}
          </span>
        </ModeToggleButton>
        <ModeToggleButton
          active={false}
          position="last"
          label={t("shiftPianoHigher")}
          onClick={() => onStartOctaveChange(startOctave + 1)}
          disabled={!canShiftUp}
        >
          <span className="text-xs font-semibold">▶</span>
        </ModeToggleButton>
      </ModeToggleGroup>

      <ModeToggleGroup>
        {SYNTH_OCTAVE_COUNTS.map((level, index) => (
          <ModeToggleButton
            key={level}
            active={octaveCount === level}
            position={modeToggleSegmentPosition(index, SYNTH_OCTAVE_COUNTS.length)}
            label={`${level} ${t("octavesShort")}`}
            onClick={() => onOctaveCountChange(level)}
          >
            <span className="text-xs font-semibold tabular-nums">{level}</span>
          </ModeToggleButton>
        ))}
      </ModeToggleGroup>
    </div>
  );
}
