import { parseNoteId } from "./pianoKeys";
import type { MusicNoteEvent } from "./songs";

/** Treble staff top line (F5) diatonic index: octave*7 + letterIndex. */
const TREBLE_TOP_DIATONIC = 5 * 7 + 3; // F5
/** Bottom staff line is E4 → 8 steps below F5. */
export const STAFF_STEP_COUNT = 8;

const LETTER_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

export type PartitureDuration = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

export type PartitureNoteLayout = {
  pitch: string;
  beats: number;
  /** Staff position: 0 = F5 line, 8 = E4 line; higher = lower on page. */
  staffPos: number;
  accidental: "#" | null;
  duration: PartitureDuration;
  /** Horizontal advance weight (relative). */
  advance: number;
};

export type PartitureLayout = {
  /** Octave shift applied for display only (+1 = 8va, -1 = 8vb). */
  displayOctaveShift: number;
  notes: PartitureNoteLayout[];
};

function letterFromNote(note: string): string {
  return note.endsWith("#") ? note.slice(0, -1) : note;
}

/** Diatonic step index for a pitch id (ignores accidental for staff line/space). */
export function diatonicIndex(pitch: string): number | null {
  const parsed = parseNoteId(pitch);
  if (!parsed) return null;
  const letter = letterFromNote(parsed.note);
  const letterIdx = LETTER_INDEX[letter];
  if (letterIdx == null) return null;
  return parsed.octave * 7 + letterIdx;
}

export function beatsToDuration(beats: number): PartitureDuration {
  if (beats >= 4) return "whole";
  if (beats >= 2) return "half";
  if (beats >= 1) return "quarter";
  if (beats >= 0.5) return "eighth";
  return "sixteenth";
}

export function durationAdvance(duration: PartitureDuration): number {
  switch (duration) {
    case "whole":
      return 2.4;
    case "half":
      return 1.8;
    case "quarter":
      return 1.2;
    case "eighth":
      return 1;
    case "sixteenth":
      return 0.85;
    default: {
      const _exhaustive: never = duration;
      return _exhaustive;
    }
  }
}

/**
 * Choose a display octave shift so the bulk of notes sit on/near the treble staff.
 * +1 = draw one octave higher than written pitch (8vb for low themes).
 * -1 = draw one octave lower (8va for high themes).
 */
export function chooseDisplayOctaveShift(pitches: string[]): number {
  const indices = pitches
    .map(diatonicIndex)
    .filter((v): v is number => v != null);
  if (indices.length === 0) return 0;

  const median = [...indices].sort((a, b) => a - b)[Math.floor(indices.length / 2)]!;
  // Staff center ≈ B4 (diatonic 4*7+6 = 34)
  const staffCenter = 4 * 7 + 6;
  const delta = median - staffCenter;
  if (delta >= 7) return -1; // mostly above staff → draw down (8va)
  if (delta <= -7) return 1; // mostly below staff → draw up (8vb)
  return 0;
}

export function pitchToStaffPos(pitch: string, displayOctaveShift: number): number | null {
  const idx = diatonicIndex(pitch);
  if (idx == null) return null;
  const shifted = idx + displayOctaveShift * 7;
  return TREBLE_TOP_DIATONIC - shifted;
}

export function pitchAccidental(pitch: string): "#" | null {
  const parsed = parseNoteId(pitch);
  if (!parsed) return null;
  return parsed.note.includes("#") ? "#" : null;
}

/** Ledger line staff positions needed for a note (even integers outside 0..8). */
export function ledgerLinePositions(staffPos: number): number[] {
  const lines: number[] = [];
  if (staffPos < 0) {
    for (let y = -2; y >= staffPos; y -= 2) {
      lines.push(y);
    }
  } else if (staffPos > STAFF_STEP_COUNT) {
    for (let y = STAFF_STEP_COUNT + 2; y <= staffPos; y += 2) {
      lines.push(y);
    }
  }
  return lines;
}

export function layoutPartiture(notes: MusicNoteEvent[]): PartitureLayout {
  const displayOctaveShift = chooseDisplayOctaveShift(notes.map((n) => n.pitch));
  const laidOut: PartitureNoteLayout[] = [];

  for (const note of notes) {
    // Keep 1:1 index alignment with song.notes for lesson highlight sync.
    const staffPos = pitchToStaffPos(note.pitch, displayOctaveShift) ?? STAFF_STEP_COUNT / 2;
    const duration = beatsToDuration(note.beats);
    laidOut.push({
      pitch: note.pitch,
      beats: note.beats,
      staffPos,
      accidental: pitchAccidental(note.pitch),
      duration,
      advance: durationAdvance(duration),
    });
  }

  return { displayOctaveShift, notes: laidOut };
}
