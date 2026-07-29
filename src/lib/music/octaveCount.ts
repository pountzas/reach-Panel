export const SYNTH_OCTAVE_COUNTS = [2, 3, 4] as const;

export type SynthOctaveCount = (typeof SYNTH_OCTAVE_COUNTS)[number];

export const SYNTH_START_OCTAVE = 3;

export const SYNTH_OCTAVE_COUNT_LABEL_KEYS = {
  2: "octaveCount2",
  3: "octaveCount3",
  4: "octaveCount4",
} as const;

export function resolveSynthOctaveCount(value: number | undefined): SynthOctaveCount {
  if (value === 2 || value === 3 || value === 4) {
    return value;
  }
  return 2;
}

/** Highest white-key note id for a keyboard starting at C3 with `octaveCount` octaves. */
export function topNoteIdForOctaveCount(octaveCount: SynthOctaveCount): string {
  return `C${SYNTH_START_OCTAVE + octaveCount}`;
}
