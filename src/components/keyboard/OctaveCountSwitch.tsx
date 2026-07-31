import {
  SYNTH_OCTAVE_COUNTS,
  SYNTH_OCTAVE_COUNT_LABEL_KEYS,
  resolveSynthOctaveCount,
  type SynthOctaveCount,
} from "../../lib/music/octaveCount";
import { modeToggleSegmentPosition } from "../../lib/buttonClasses";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useTranslation } from "../../hooks/useTranslation";
import type { TranslationKey } from "../../i18n";

interface OctaveCountSwitchProps {
  value: number | undefined;
  onChange: (count: SynthOctaveCount) => void;
}

export function OctaveCountSwitch({ value, onChange }: OctaveCountSwitchProps) {
  const { t } = useTranslation();
  const count = resolveSynthOctaveCount(value);

  return (
    <ModeToggleGroup>
      {SYNTH_OCTAVE_COUNTS.map((level, index) => {
        const labelKey = SYNTH_OCTAVE_COUNT_LABEL_KEYS[level] as TranslationKey;
        return (
          <ModeToggleButton
            key={level}
            active={count === level}
            position={modeToggleSegmentPosition(index, SYNTH_OCTAVE_COUNTS.length)}
            label={t(labelKey)}
            onClick={() => onChange(level)}
          >
            <span className="text-xs font-semibold tabular-nums">{level}</span>
          </ModeToggleButton>
        );
      })}
    </ModeToggleGroup>
  );
}
