export const SYNTH_OCTAVE_COUNTS = [2, 3, 4, 5] as const;

export type SynthOctaveCount = (typeof SYNTH_OCTAVE_COUNTS)[number];

/** Default free-play window: C3–C5. */
export const SYNTH_START_OCTAVE = 3;
export const SYNTH_TOP_OCTAVE = 5;

/** Lowest / highest allowed start C for the sliding window. */
export const SYNTH_MIN_START_OCTAVE = 0;
export const SYNTH_MAX_START_OCTAVE = 6;

export const SYNTH_OCTAVE_COUNT_LABEL_KEYS = {
  2: "octaveCount2",
  3: "octaveCount3",
  4: "octaveCount4",
  5: "octaveCount5",
} as const;

export function resolveSynthOctaveCount(value: number | undefined): SynthOctaveCount {
  if (value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 2;
}

/** 5-octave mode uses the full input row; mouse panel is forced off. */
export function isWidePianoOctaveCount(count: number | undefined): boolean {
  return resolveSynthOctaveCount(count) === 5;
}

export function resolveSynthStartOctave(
  value: number | undefined,
  octaveCount: SynthOctaveCount = 2,
): number {
  const fallback = SYNTH_TOP_OCTAVE - octaveCount;
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(
    SYNTH_MAX_START_OCTAVE,
    Math.max(SYNTH_MIN_START_OCTAVE, Math.round(value)),
  );
}

/** Top C for a window starting at `startOctave` with `octaveCount` octaves. */
export function topOctaveForWindow(startOctave: number, octaveCount: number): number {
  return startOctave + octaveCount;
}

export function pianoRangeLabel(startOctave: number, octaveCount: number): string {
  return `C${startOctave}–C${topOctaveForWindow(startOctave, octaveCount)}`;
}
