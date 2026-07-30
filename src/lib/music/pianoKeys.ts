import {
  resolveSynthOctaveCount,
  resolveSynthStartOctave,
  SYNTH_MAX_START_OCTAVE,
  SYNTH_MIN_START_OCTAVE,
  type SynthOctaveCount,
} from "./octaveCount";

const WHITE_NOTES = ["C", "D", "E", "F", "G", "A", "B"] as const;
const BLACK_AFTER_WHITE: Record<number, string> = {
  0: "C#",
  1: "D#",
  3: "F#",
  4: "G#",
  5: "A#",
};

const NOTE_SEMITONES: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type PianoKey = {
  id: string;
  label: string;
  freq: number;
  isBlack: boolean;
  leftRatio?: number;
};

export type PianoRangeFit = {
  startOctave: number;
  octaveCount: SynthOctaveCount;
  fitsCompletely: boolean;
  songMinId: string;
  songMaxId: string;
};

export function parseNoteId(noteId: string): { note: string; octave: number } | null {
  const match = /^([A-G]#?)(\d+)$/.exec(noteId);
  if (!match) return null;
  const note = match[1]!;
  const octave = Number(match[2]);
  if (!(note in NOTE_SEMITONES) || Number.isNaN(octave)) return null;
  return { note, octave };
}

export function noteIdToMidi(noteId: string): number | null {
  const parsed = parseNoteId(noteId);
  if (!parsed) return null;
  return (parsed.octave + 1) * 12 + NOTE_SEMITONES[parsed.note]!;
}

export function midiToNoteId(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]!;
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function noteToMidi(note: string, octave: number): number {
  return (octave + 1) * 12 + NOTE_SEMITONES[note]!;
}

export function buildPianoKeys(
  octaveCountInput: number = 2,
  startOctaveInput?: number,
): { whiteKeys: PianoKey[]; blackKeys: PianoKey[] } {
  const octaveCount = resolveSynthOctaveCount(octaveCountInput);
  const startOctave = resolveSynthStartOctave(startOctaveInput, octaveCount);
  const whiteKeys: PianoKey[] = [];
  const blackKeys: PianoKey[] = [];

  for (let octave = startOctave; octave < startOctave + octaveCount; octave++) {
    for (let i = 0; i < WHITE_NOTES.length; i++) {
      const note = WHITE_NOTES[i]!;
      const id = `${note}${octave}`;
      whiteKeys.push({
        id,
        label: note,
        freq: midiToFreq(noteToMidi(note, octave)),
        isBlack: false,
      });

      const blackNote = BLACK_AFTER_WHITE[i];
      if (blackNote) {
        const globalWhiteIndex = (octave - startOctave) * 7 + i;
        blackKeys.push({
          id: `${blackNote}${octave}`,
          label: blackNote,
          freq: midiToFreq(noteToMidi(blackNote, octave)),
          isBlack: true,
          leftRatio: (globalWhiteIndex + 1) / (octaveCount * 7 + 1),
        });
      }
    }
  }

  const topC = startOctave + octaveCount;
  whiteKeys.push({
    id: `C${topC}`,
    label: "C",
    freq: midiToFreq(noteToMidi("C", topC)),
    isBlack: false,
  });

  return { whiteKeys, blackKeys };
}

export function windowMinMidi(startOctave: number, _octaveCount: SynthOctaveCount): number {
  return noteToMidi("C", startOctave);
}

export function windowMaxMidi(startOctave: number, octaveCount: SynthOctaveCount): number {
  return noteToMidi("C", startOctave + octaveCount);
}

function pitchBounds(noteIds: string[]): { minMidi: number; maxMidi: number } | null {
  let minMidi = Number.POSITIVE_INFINITY;
  let maxMidi = Number.NEGATIVE_INFINITY;
  for (const id of noteIds) {
    const midi = noteIdToMidi(id);
    if (midi == null) continue;
    minMidi = Math.min(minMidi, midi);
    maxMidi = Math.max(maxMidi, midi);
  }
  if (!Number.isFinite(minMidi) || !Number.isFinite(maxMidi)) return null;
  return { minMidi, maxMidi };
}

/**
 * Choose the smallest 2–5 octave C-to-C window that covers the pitches.
 * If the song is wider than 5 octaves, use a centered 5-octave window.
 */
export function fitPianoRangeToPitches(noteIds: string[]): PianoRangeFit | null {
  const bounds = pitchBounds(noteIds);
  if (!bounds) return null;
  const { minMidi, maxMidi } = bounds;
  const songMinId = midiToNoteId(minMidi);
  const songMaxId = midiToNoteId(maxMidi);
  const span = maxMidi - minMidi;

  for (const octaveCount of [2, 3, 4, 5] as const) {
    const windowSpan = octaveCount * 12;
    if (span > windowSpan) continue;

    // Prefer the lowest window that covers both ends (more bass room).
    for (
      let startOctave = SYNTH_MIN_START_OCTAVE;
      startOctave <= SYNTH_MAX_START_OCTAVE;
      startOctave++
    ) {
      if (
        windowMinMidi(startOctave, octaveCount) <= minMidi &&
        windowMaxMidi(startOctave, octaveCount) >= maxMidi
      ) {
        return {
          startOctave,
          octaveCount,
          fitsCompletely: true,
          songMinId,
          songMaxId,
        };
      }
    }
  }

  // Wider than 5 octaves: center a 5-octave window on the song.
  const octaveCount = 5 as const;
  const mid = (minMidi + maxMidi) / 2;
  const idealStartMidi = mid - (octaveCount * 12) / 2;
  let startOctave = Math.round(idealStartMidi / 12) - 1;
  startOctave = Math.min(
    SYNTH_MAX_START_OCTAVE,
    Math.max(SYNTH_MIN_START_OCTAVE, startOctave),
  );

  return {
    startOctave,
    octaveCount,
    fitsCompletely: false,
    songMinId,
    songMaxId,
  };
}

/** @deprecated Prefer fitPianoRangeToPitches — kept for call sites needing only count. */
export function requiredOctaveCount(noteIds: string[]): SynthOctaveCount | null {
  return fitPianoRangeToPitches(noteIds)?.octaveCount ?? null;
}
