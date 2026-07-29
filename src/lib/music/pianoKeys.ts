import {
  resolveSynthOctaveCount,
  SYNTH_START_OCTAVE,
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

export type PianoKey = {
  id: string;
  label: string;
  freq: number;
  isBlack: boolean;
  leftRatio?: number;
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

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function noteToMidi(note: string, octave: number): number {
  return (octave + 1) * 12 + NOTE_SEMITONES[note]!;
}

export function buildPianoKeys(
  octaveCountInput: number = 2,
  startOctave: number = SYNTH_START_OCTAVE,
): { whiteKeys: PianoKey[]; blackKeys: PianoKey[] } {
  const octaveCount = resolveSynthOctaveCount(octaveCountInput);
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

export function maxMidiForOctaveCount(octaveCount: SynthOctaveCount): number {
  return noteToMidi("C", SYNTH_START_OCTAVE + octaveCount);
}

export function minMidiForKeyboard(): number {
  return noteToMidi("C", SYNTH_START_OCTAVE);
}

/** Smallest octave count (2–4) that can play every note in `noteIds`, or null if impossible. */
export function requiredOctaveCount(noteIds: string[]): SynthOctaveCount | null {
  let maxMidi = minMidiForKeyboard();
  for (const id of noteIds) {
    const midi = noteIdToMidi(id);
    if (midi == null) return null;
    if (midi < minMidiForKeyboard()) return null;
    maxMidi = Math.max(maxMidi, midi);
  }

  for (const count of [2, 3, 4] as const) {
    if (maxMidi <= maxMidiForOctaveCount(count)) {
      return count;
    }
  }
  return null;
}
